import type {
  DifyProvider,
  GovernedContentProvider,
  GovernedContentRelease,
  Providers,
  ServiceAvailability,
} from "./types";

/**
 * Dify 与受治理内容边界的确定性替身。
 *
 * 替身状态只属于当前进程，可由测试控制接口修改。它不读取案情内容，
 * 也不返回任何真实模型或真实法源数据。
 */
export interface FixtureState {
  difyAvailable: boolean;
  eligibleExampleCount: number;
}

export interface FixtureControls extends Providers {
  getState(): FixtureState;
  updateState(patch: Partial<FixtureState>): FixtureState;
  reset(): FixtureState;
}

export const DEFAULT_FIXTURE_STATE: FixtureState = {
  difyAvailable: true,
  eligibleExampleCount: 1,
};

const FIXTURE_RELEASE_ID = "fixture-release-0001";

function normalize(state: FixtureState): FixtureState {
  return {
    difyAvailable: state.difyAvailable,
    eligibleExampleCount: Math.max(0, Math.trunc(state.eligibleExampleCount)),
  };
}

export function createFixtureControls(initial: Partial<FixtureState> = {}): FixtureControls {
  let state = normalize({ ...DEFAULT_FIXTURE_STATE, ...initial });

  const dify: DifyProvider = {
    kind: "fixture",
    async getAvailability(): Promise<ServiceAvailability> {
      return state.difyAvailable
        ? { available: true, reason: null }
        : { available: false, reason: "分析服务暂不可用" };
    },
  };

  const content: GovernedContentProvider = {
    kind: "fixture",
    async getActiveRelease(): Promise<GovernedContentRelease> {
      return {
        releaseId: FIXTURE_RELEASE_ID,
        eligibleExampleCount: state.eligibleExampleCount,
      };
    },
  };

  return {
    dify,
    content,
    getState: () => ({ ...state }),
    updateState(patch) {
      state = normalize({ ...state, ...patch });
      return { ...state };
    },
    reset() {
      state = { ...DEFAULT_FIXTURE_STATE };
      return { ...state };
    },
  };
}
