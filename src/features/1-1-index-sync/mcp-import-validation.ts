import type { IndexedScreen, SearchTeam } from "../../lib/types";
import { canonicalTeam } from "../../lib/screen-identity";
import { getFileSources } from "./file-registry";

type Rule = (value: unknown) => boolean;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text: Rule = v => typeof v === "string" && v.length <= 20_000;
const nonempty: Rule = v => text(v) && (v as string).trim().length > 0;
const number: Rule = v => typeof v === "number" && Number.isFinite(v) && v >= 0;
const array = (rule: Rule): Rule => v => Array.isArray(v) && v.length <= 4000 && v.every(rule);
const strings = array(text);
const oneOf = (...values: unknown[]): Rule => v => values.includes(v);
const date: Rule = v => typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));
const node: Rule = v => typeof v === "string" && /^\d+:\d+$/.test(v);
function shape(required: Record<string, Rule>, optional: Record<string, Rule> = {}): Rule {
  return v => record(v) && Object.entries(required).every(([k, rule]) => rule(v[k]))
    && Object.entries(v).every(([k, value]) => Object.hasOwn(required, k) || (Object.hasOwn(optional, k) && optional[k](value)));
}
const component = shape({ name: nonempty, isMds: v => typeof v === "boolean" }, {
  instanceId: nonempty, path: strings, variant: text, library: text, mdsVersion: oneOf("v1", "v2"),
});
const element = shape({ id: node, component: nonempty, mdsVersion: oneOf("v1", "v2"), tokens: strings, texts: strings,
  box: shape({ x: v => typeof v === "number" && Number.isFinite(v), y: v => typeof v === "number" && Number.isFinite(v), width: number, height: number }) }, { variant: text });
const screenShape = shape({ id: node, fileKey: nonempty, teamPage: nonempty, name: nonempty, texts: strings,
  components: array(component), tokens: strings, figmaUrl: nonempty, syncedAt: date }, {
  fileName: text, pageId: node, pageName: text, sourceId: nonempty, originalTeam: nonempty, cohortLabels: strings,
  designStatus: oneOf("unknown"), structure: oneOf("screen", "container-child"), section: text, width: number, height: number, elements: array(element),
});

export interface ImportIssue { row: number; reason: string }
export function validateMcpImport(value: unknown, team: SearchTeam): { screens: IndexedScreen[]; acceptedRows: number[]; rejected: ImportIssue[] } {
  if (!record(value) || value.team !== team || !date(value.syncedAt) || !Array.isArray(value.screens)
    || value.screens.length === 0 || value.screens.length > 500 || !Array.isArray(value.excluded)
    || Object.keys(value).some(k => !["team", "syncedAt", "screens", "excluded", "files"].includes(k))
    || (value.files !== undefined && !Array.isArray(value.files))) {
    throw new Error("TeamIndex의 team·syncedAt·screens(1~500개)·excluded를 확인해 주세요.");
  }
  const screens: IndexedScreen[] = [], acceptedRows: number[] = [], rejected: ImportIssue[] = [];
  const sources = getFileSources(team);
  value.screens.forEach((raw, row) => {
    let reason = "";
    if (!screenShape(raw)) reason = "필수 필드·자료형·허용 필드를 확인해 주세요. 화면 원본이나 추가 비밀 필드는 허용하지 않습니다.";
    else {
      const s = raw as IndexedScreen;
      const source = sources.find(f => f.fileKey === s.fileKey && (f.role !== "archive" || f.pageIds?.includes(s.pageId ?? "")));
      if (s.teamPage !== team || (s.originalTeam !== undefined && canonicalTeam(s.originalTeam) !== team) || !source
        || (s.originalTeam !== undefined && !["앱", "플그", "크루", "공홈", "어드민"].includes(s.originalTeam))
        || (source.originalTeam && s.originalTeam && source.originalTeam !== s.originalTeam)
        || (s.sourceId !== undefined && s.sourceId !== source.sourceId)) reason = "선택한 팀·등록 파일·아카이브 페이지 범위를 벗어났습니다.";
      else if (!s.texts.some(t => t.trim()) && !s.components.length && !s.tokens.some(t => t.trim()) && !s.elements?.length) {
        reason = "화면 내용의 검색 근거가 없습니다. 이름·구역만으로 가져올 수 없습니다.";
      }
      else {
        try {
          const url = new URL(s.figmaUrl);
          const path = /^\/(?:design|file)\/([^/]+)(?:\/.*)?$/.exec(url.pathname);
          if (url.protocol !== "https:" || url.hostname !== "www.figma.com" || url.port || url.username || url.password
            || path?.[1] !== s.fileKey || url.searchParams.get("node-id")?.replace("-", ":") !== s.id) reason = "원본 링크의 파일·프레임이 데이터와 다릅니다.";
        } catch { reason = "원본 링크가 올바르지 않습니다."; }
      }
    }
    if (reason) rejected.push({ row, reason }); else { screens.push(raw as IndexedScreen); acceptedRows.push(row); }
  });
  return { screens, acceptedRows, rejected };
}
