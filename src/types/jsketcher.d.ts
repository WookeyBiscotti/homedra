declare module 'jsketcher/constr/solverConstraints' {
  export function createByConstraintName(
    name: string,
    params: unknown[],
    values: unknown[],
  ): object | undefined
  export const EqualsTo: new (params: unknown[], value: number) => object
  export const ConstantWrapper: new (constr: object, mask: boolean[]) => object
  export const Weighted: new (constr: object, weight: number) => object
}

declare module 'jsketcher/constr/solver' {
  export function prepare(
    constrs: object[],
    locked: unknown[],
  ): {
    diagnose: () => { conflict: boolean; dof: number }
    error: () => number
    solveSystem: (rough?: boolean) => {
      success?: boolean
      error?: number
      evalCount?: number
      returnCode?: number
    }
    system: unknown
    updateLock: (values: number[]) => void
  }
}

declare module 'numeric' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const numeric: Record<string, any>
  export default numeric
  export function dotVM(...args: unknown[]): unknown
}
