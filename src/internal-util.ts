import { Application } from './index.js'
import { Extension } from './extension.js'
import { MessageContext } from './message-context.js'
import { RouterContext } from './router.js'

type OmitKeysOfType<T, IncludeType> = { [K in keyof T]: T[K] extends IncludeType ? never : K }[keyof T]
// type OnlyKeysOfType<T, ExcludeType> = { [K in keyof T]: T[K] extends ExcludeType ? K : never }[keyof T]
type PromiseFlat<T> = T extends void ? void : T extends Promise<infer R> ? PromiseFlat<R> : T
type NotTopFunction = null | undefined | string | number | boolean | symbol | Record<string | number | symbol, object | null | undefined | string | number | boolean | symbol>
type RetType<Fn> = Fn extends (...args: any[]) => infer R ? R extends Partial<infer H> ? H : never : never
type Res<T> = T extends void ? never : T
type CompleteRes<T> = Res<PromiseFlat<RetType<T>>>
/** Execute a function on a on a regular object array returing all results. Will also wait on any promise returning functions. */
function execFunctionOnArray<T extends object, K extends OmitKeysOfType<T, NotTopFunction>>(array: T[], functionName: K, ...params: Parameters<T[K]>): Promise<CompleteRes<T[K]>[]> {
  return Promise.all(array.filter(item => functionName in item).map(item => item[functionName](...params)))
}

/** Runs a function of an object array and ignores the values the functions return. */
export async function doLifecycle<T extends object, K extends OmitKeysOfType<T, NotTopFunction>>(array: T[], functionName: K, ...params: Parameters<T[K]>): Promise<void> {
  await execFunctionOnArray(array, functionName, ...params)
}

/** Decorate an Application with the provided extensions. */
export async function decorateApplication(app: Application, ...extensions: Extension[]) {
  Object.assign(app, ...(await execFunctionOnArray(extensions, 'decorateApplication', app)).filter(Boolean))
}

/** Decorate a Router with the provided extensions. */
export async function decorateRouterContext(router: RouterContext, ...extensions: Extension[]) {
  await doLifecycle(extensions, 'decorateRouterContext', router)
  Object.assign(router, ...(await execFunctionOnArray(extensions, 'decorateRouterContext', router)).filter(Boolean))
}

/** Decorate an Message Context with the provided extensions. */
export async function decorateMessageContext(message: MessageContext, ...extensions: Extension[]) {
  await doLifecycle(extensions, 'decorateMessageContext', message)
  Object.assign(message, ...(await execFunctionOnArray(extensions, 'decorateMessageContext', message)).filter(Boolean))
}
