import type { IndexedScreen, SearchResult, TeamPage } from "../../lib/types";

export type ConditionKind = "service" | "screen" | "function" | "state" | "component" | "property" | "platform" | "text" | "token" | "cohort";
export type Requirement = "must" | "should" | "exclude";
export type VerificationStatus = "확인됨" | "추정" | "확인 불가" | "불충족";

/** 2-1 내부 형식. 기존 label/aliases 호출자(3-2 포함)도 그대로 허용한다. */
export interface SearchCondition {
  label: string;
  aliases: string[];
  id?: string;
  kind?: ConditionKind;
  requirement?: Requirement;
  sourceText?: string;
  scope?: "screen" | "region" | "element";
  /** 이 조건과 같은 컴포넌트 사용 정보/요소에서 검증해야 하는 조건 ID */
  relatedTo?: string;
}

export interface QueryUnderstanding {
  conditions: SearchCondition[];
  warnings?: string[];
}

export interface EvidenceAtom {
  ref: string;
  source: "팀" | "구역" | "화면 이름" | "화면 속 텍스트" | "컴포넌트" | "variant" | "토큰" | "출처" | "기수 표기";
  value: string;
  strength: "direct" | "hint";
  /** 같은 인스턴스가 아니라 인덱스에 보존된 같은 사용 정보임에 주의 */
  owner?: string;
}

export interface ConditionCheck {
  conditionId: string;
  status: VerificationStatus;
  evidenceRefs: string[];
  explanation: string;
  scope?: "screen" | "region" | "element" | "unknown";
}

export interface AiJudgement {
  screenId: string;
  verdict: SearchResult["verdict"];
  reasons: string[];
  unmetConditions?: string[];
  relevance?: "high" | "medium" | "low" | "irrelevant";
  checks?: ConditionCheck[];
}

export interface AiCandidate {
  fileName?: string;
  pageName?: string;
  structure?: IndexedScreen["structure"];
  cohortLabels?: string[];
  screenId: string;
  section?: string;
  name: string;
  texts: string[];
  components: IndexedScreen["components"];
  tokens: string[];
  preliminaryMatches: string[];
  preliminaryMisses: string[];
  evidence?: EvidenceAtom[];
  frame?: { width?: number; height?: number };
  elements?: IndexedScreen["elements"];
}

export interface SearchAi {
  interpret(input: { query: string; team: TeamPage; signal?: AbortSignal }): Promise<QueryUnderstanding>;
  judge(input: { query: string; team: TeamPage; candidates: AiCandidate[]; conditions?: SearchCondition[]; signal?: AbortSignal }): Promise<AiJudgement[]>;
}
