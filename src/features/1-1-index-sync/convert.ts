import type { ComponentUsage, ExcludedFrame, IndexedScreen, MdsElement, TeamPage } from "../../lib/types";
import { mdsLibraryName, type MdsKeys } from "./mds";
import { judgeFrame, type FrameStats } from "./screen-rules";

/**
 * Figma 노드 조회 응답을 검색 인덱스 형식으로 바꿉니다. (Figma는 읽기만 합니다.)
 * - 화면으로 판정된 프레임만 인덱스에 넣고, 제외한 프레임은 이유와 함께 따로 돌려줍니다.
 * - 숨겨진 레이어는 하위까지 모두 건너뜁니다.
 * - 구역(SECTION) 안의 구역은 끝까지 따라 들어갑니다.
 */

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  characters?: string;
  componentId?: string;
  styles?: Record<string, string>;
  absoluteBoundingBox?: { width: number; height: number };
  children?: FigmaNode[];
}

interface FigmaComponentInfo {
  key: string;
  name: string;
  componentSetId?: string;
  remote?: boolean;
}

/** `/v1/files/:key/nodes?ids=…` 응답에서 노드 하나 */
export interface FigmaNodeResponse {
  document: FigmaNode;
  components?: Record<string, FigmaComponentInfo>;
  componentSets?: Record<string, { name: string }>;
  styles?: Record<string, { key: string; name: string }>;
}

export interface ConvertOptions {
  fileKey: string;
  teamPage: TeamPage;
  syncedAt: string;
  /** MDS v1·v2 파일에 있는 컴포넌트·스타일 키 (loadMdsKeys). 여기에 없는 것은 MDS가 적용되지 않은 것으로 본다. */
  mdsKeys: MdsKeys;
}

export type { ExcludedFrame };

export interface ConvertResult {
  screens: IndexedScreen[];
  excluded: ExcludedFrame[]; // 화면이 아니라고 본 프레임 (사람이 검토할 수 있게 남김)
  ignored: number; // 프레임이 아닌 요소(아이콘, 글자 조각 등)의 수
}

export function nodeToScreens(response: FigmaNodeResponse, options: ConvertOptions): ConvertResult {
  const result: ConvertResult = { screens: [], excluded: [], ignored: 0 };
  const root = response.document;
  if (root.type === "SECTION") {
    collect(root, [root.name], response, options, result);
  } else {
    // 구역에 들어 있지 않고 페이지에 바로 놓인 프레임
    collect({ ...root, id: "", name: "", type: "CANVAS", children: [root] }, [], response, options, result);
  }
  return result;
}

function collect(
  container: FigmaNode,
  sectionPath: string[],
  response: FigmaNodeResponse,
  options: ConvertOptions,
  result: ConvertResult,
) {
  for (const child of container.children ?? []) {
    if (child.visible === false) continue;

    if (child.type === "SECTION") {
      collect(child, [...sectionPath, child.name], response, options, result);
    } else if (child.type === "FRAME") {
      const analyzed = analyzeFrame(child, response, options);
      const box = child.absoluteBoundingBox ?? { width: 0, height: 0 };
      const verdict = judgeFrame({ type: child.type, ...box }, analyzed.stats);
      if (verdict.isScreen) {
        result.screens.push(toScreen(child, sectionPath, analyzed, response, options));
      } else {
        result.excluded.push({ id: child.id, name: child.name, reason: verdict.reason });
      }
    } else {
      result.ignored += 1;
    }
  }
}

function analyzeFrame(frame: FigmaNode, response: FigmaNodeResponse, options: ConvertOptions) {
  const stats: FrameStats = { texts: 0, instances: 0, shapes: 0 };
  const texts: string[] = [];
  const components = new Map<string, ComponentUsage>();
  const tokens = new Set<string>();

  const visit = (node: FigmaNode) => {
    if (node.visible === false) return;

    if (node.type === "TEXT") {
      stats.texts += 1;
      const text = node.characters?.trim();
      if (text) texts.push(text);
    } else if (node.type === "INSTANCE") {
      stats.instances += 1;
      const usage = toComponentUsage(node, response, options);
      if (usage) components.set(`${usage.name}|${usage.variant ?? ""}|${usage.library ?? ""}`, usage);
    } else if (node.type !== "FRAME" && node.type !== "GROUP") {
      stats.shapes += 1;
    }

    // 토큰은 MDS 파일에 있는 스타일만 넣는다. (앱팀이 직접 만든 스타일은 제외)
    for (const styleId of Object.values(node.styles ?? {})) {
      const style = response.styles?.[styleId];
      if (style && options.mdsKeys.styles.has(style.key)) tokens.add(style.name);
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(frame);

  return { stats, texts: [...new Set(texts)], components: [...components.values()], tokens: [...tokens] };
}

function toComponentUsage(
  node: FigmaNode,
  response: FigmaNodeResponse,
  options: ConvertOptions,
): ComponentUsage | undefined {
  const info = node.componentId ? response.components?.[node.componentId] : undefined;
  if (!info) return undefined;

  // 변형이 있는 컴포넌트는 묶음 이름이 컴포넌트 이름이고, 개별 이름("State=Empty, Size=Small")이 변형 값이다.
  const setName = info.componentSetId ? response.componentSets?.[info.componentSetId]?.name : undefined;

  // MDS v1·v2 파일에 있는 컴포넌트만 MDS로 본다. 그 외에는 MDS가 적용되지 않은 것이다.
  const mdsVersion = options.mdsKeys.components.get(info.key);
  return {
    name: setName ?? info.name,
    variant: setName ? info.name : undefined,
    library: mdsVersion ? mdsLibraryName(mdsVersion) : undefined,
    isMds: mdsVersion !== undefined,
    mdsVersion,
  };
}

const MAX_ELEMENT_TEXTS = 10;

/**
 * 화면 속 MDS 컴포넌트를 위치와 함께 뽑는다. (2-4 MDS 표시가 화면 위에 보여 준다)
 * - MDS가 아닌 컴포넌트(시스템 UI 포함)는 요소로 넣지 않는다. 다만 그 안에 든 MDS 컴포넌트는 찾아 들어간다.
 * - MDS 컴포넌트를 만나면 그 안쪽 컴포넌트는 보지 않고 거기서 멈춘다.
 * - 숨겨진 레이어는 건너뛴다.
 * - 화면 프레임 영역 밖에 있는 요소는 화면 이미지에 보이지 않으므로 넣지 않고, 걸쳐 있으면 화면 안쪽만 남긴다.
 */
function extractMdsElements(frame: FigmaNode, response: FigmaNodeResponse, options: ConvertOptions): MdsElement[] {
  const origin = frame.absoluteBoundingBox as { x: number; y: number; width: number; height: number } | undefined;
  if (!origin) return [];
  const elements: MdsElement[] = [];

  const walk = (node: FigmaNode) => {
    if (node.visible === false) return;
    const box = node.absoluteBoundingBox as { x: number; y: number; width: number; height: number } | undefined;
    const usage = node.type === "INSTANCE" ? toComponentUsage(node, response, options) : undefined;
    if (usage?.mdsVersion && box) {
      const left = Math.max(box.x, origin.x);
      const top = Math.max(box.y, origin.y);
      const right = Math.min(box.x + box.width, origin.x + origin.width);
      const bottom = Math.min(box.y + box.height, origin.y + origin.height);
      if (right > left && bottom > top) {
        const { texts, tokens } = describeSubtree(node, response, options);
        elements.push({
          id: node.id,
          component: usage.name,
          variant: usage.variant,
          mdsVersion: usage.mdsVersion,
          tokens,
          texts,
          box: {
            x: Math.round(left - origin.x),
            y: Math.round(top - origin.y),
            width: Math.round(right - left),
            height: Math.round(bottom - top),
          },
        });
      }
      return; // 화면 밖이든 안이든 MDS 컴포넌트 안쪽은 보지 않는다
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(frame);
  return elements;
}

/** 요소 안의 글과 MDS 토큰 (숨겨진 레이어 제외) */
function describeSubtree(root: FigmaNode, response: FigmaNodeResponse, options: ConvertOptions) {
  const texts = new Set<string>();
  const tokens = new Set<string>();
  const visit = (node: FigmaNode) => {
    if (node.visible === false) return;
    const text = node.type === "TEXT" ? node.characters?.trim() : undefined;
    if (text) texts.add(text);
    for (const styleId of Object.values(node.styles ?? {})) {
      const style = response.styles?.[styleId];
      if (style && options.mdsKeys.styles.has(style.key)) tokens.add(style.name);
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return { texts: [...texts].slice(0, MAX_ELEMENT_TEXTS), tokens: [...tokens] };
}

function toScreen(
  frame: FigmaNode,
  sectionPath: string[],
  analyzed: ReturnType<typeof analyzeFrame>,
  response: FigmaNodeResponse,
  options: ConvertOptions,
): IndexedScreen {
  const { fileKey, teamPage, syncedAt } = options;
  const size = frame.absoluteBoundingBox;
  return {
    id: frame.id,
    fileKey,
    teamPage,
    section: sectionPath.length > 0 ? sectionPath.join(" > ") : undefined,
    name: frame.name,
    texts: analyzed.texts,
    components: analyzed.components,
    tokens: analyzed.tokens,
    width: size ? Math.round(size.width) : undefined,
    height: size ? Math.round(size.height) : undefined,
    elements: extractMdsElements(frame, response, options),
    figmaUrl: `https://www.figma.com/design/${fileKey}/?node-id=${frame.id.replace(":", "-")}`,
    syncedAt,
  };
}
