import type { ComponentUsage, IndexedScreen, TeamPage } from "../../lib/types";
import { classifyLibrary } from "./mds";
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
  styles?: Record<string, { name: string }>;
}

export interface ConvertOptions {
  fileKey: string;
  teamPage: TeamPage;
  syncedAt: string;
  /** 컴포넌트 키 → 소속 라이브러리 파일 이름. 여기 없는 원격 컴포넌트는 소속을 모르는 것으로 둔다. */
  libraryByComponentKey?: Record<string, string>;
  /** 이 파일 안에서 만든 컴포넌트(원격이 아닌 것)의 소속 이름 */
  localLibraryName?: string;
}

export interface ExcludedFrame {
  id: string;
  name: string;
  reason: string;
}

export interface ConvertResult {
  screens: IndexedScreen[];
  excluded: ExcludedFrame[]; // 화면이 아니라고 본 프레임 (사람이 검토할 수 있게 남김)
  ignored: number; // 프레임이 아닌 요소(아이콘, 글자 조각 등)의 수
}

/** 응답의 컴포넌트 키 목록. 라이브러리 소속 조회(resolveLibraryNames)의 입력으로 쓴다. */
export function remoteComponentKeys(response: FigmaNodeResponse): string[] {
  return Object.values(response.components ?? {})
    .filter((component) => component.remote)
    .map((component) => component.key);
}

export function nodeToScreens(response: FigmaNodeResponse, options: ConvertOptions): ConvertResult {
  const result: ConvertResult = { screens: [], excluded: [], ignored: 0 };
  const root = response.document;
  collect(root, root.type === "SECTION" ? [root.name] : [], response, options, result);
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
        result.screens.push(toScreen(child, sectionPath, analyzed, options));
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

    for (const styleId of Object.values(node.styles ?? {})) {
      const styleName = response.styles?.[styleId]?.name;
      if (styleName) tokens.add(styleName);
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

  // 소속을 모르면 library를 비워 두고 isMds는 false로 둔다. (library가 있고 isMds가 false면 "MDS가 아닌 라이브러리")
  const library = info.remote ? options.libraryByComponentKey?.[info.key] : options.localLibraryName;
  return {
    name: setName ?? info.name,
    variant: setName ? info.name : undefined,
    library,
    ...classifyLibrary(library),
  };
}

function toScreen(
  frame: FigmaNode,
  sectionPath: string[],
  analyzed: ReturnType<typeof analyzeFrame>,
  { fileKey, teamPage, syncedAt }: ConvertOptions,
): IndexedScreen {
  return {
    id: frame.id,
    fileKey,
    teamPage,
    section: sectionPath.length > 0 ? sectionPath.join(" > ") : undefined,
    name: frame.name,
    texts: analyzed.texts,
    components: analyzed.components,
    tokens: analyzed.tokens,
    figmaUrl: `https://www.figma.com/design/${fileKey}/?node-id=${frame.id.replace(":", "-")}`,
    syncedAt,
  };
}
