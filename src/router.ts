import { Extension } from './extension.js'
import { MessageContext } from './message-context.js'
import { decorateRouteListener, decorateRouterContext } from './internal-util.js'

type TOrPromiseT<T> = T | Promise<T>
export type RouteHandler = (context: MessageContext) => TOrPromiseT<Uint8Array | string | NodeJS.ReadableStream | void>

export namespace RouterHandleResponse {
  export enum Type {
    RESULT,
    HANDLED,
    UNHANDLED,
  }
  export interface Map {
    [Type.RESULT]: { type: Type.RESULT; result: Uint8Array | string | NodeJS.ReadableStream }
    [Type.HANDLED]: { type: Type.HANDLED }
    [Type.UNHANDLED]: { type: Type.UNHANDLED }
  }
  const allTypes = [Type.RESULT, Type.HANDLED, Type.UNHANDLED]
  export type AnyType = Map[Type]
  export function is(object: unknown): object is Map[Type]
  export function is<T extends Type>(object: unknown, type: T): object is Map[T]
  export function is<T extends Type>(object: unknown, type?: T): object is Map[T] {
    return (
      typeof object === 'object' &&
      object !== null &&
      (type !== undefined ? (object as any).type === type : allTypes.includes((object as any).type))
    )
  }

  export function create(type: Type.RESULT, result: Uint8Array | string | NodeJS.ReadableStream): Map[Type.RESULT]
  export function create(type: Type.HANDLED): Map[Type.HANDLED]
  export function create(type: Type.UNHANDLED): Map[Type.UNHANDLED]
  export function create<T extends Type>(type: T, ...args: any[]): Map[T] {
    if (type === Type.RESULT) {
      return { type, result: args[0] } as Map[Type.RESULT] as Map[T]
    } else if (type === Type.HANDLED) {
      return { type } as Map[Type.HANDLED] as Map[T]
    } else if (type === Type.UNHANDLED) {
      return { type } as Map[Type.UNHANDLED] as Map[T]
    }
    throw new Error('?')
  }
}

type Handler = (message: MessageContext) => Promise<RouterHandleResponse.AnyType>
/** A representation of a route listener. */
export interface RouteListener extends Servess.RouteListener {
  /** Make the route listener handle a particular message context. */
  (message: MessageContext): Promise<RouterHandleResponse.AnyType>
  /** Replace the function that would handle ant incoming message context with a new one. */
  replaceHandler(handler: RouteHandler): RouteListener
  /** Add a pre-condition to the listener. */
  addPreCondition(handler: (message: MessageContext) => boolean | Promise<boolean>): RouteListener
  /** Remove this route listener from whatever parent router it is a part of. */
  detach(): void
}

namespace RouteListener {
  export function create(pathAsRegExp: RegExp, detachFunction: () => void, extensions: Extension[]) {
    let routeHandler: RouteHandler
    const preConditions: ((message: MessageContext) => boolean | Promise<boolean>)[] = []

    const result = wrappedRouteHandler as RouteListener
    result.addPreCondition = handler => {
      preConditions.push(handler)
      return result
    }
    result.replaceHandler = newHandler => {
      routeHandler = newHandler
      return result
    }
    result.detach = detachFunction
    decorateRouteListener(result, ...extensions)
    return result

    async function wrappedRouteHandler(ctx: MessageContext): Promise<RouterHandleResponse.AnyType> {
      if (!pathAsRegExp.test(ctx.path)) return RouterHandleResponse.create(RouterHandleResponse.Type.UNHANDLED)
      for (const preCondition of preConditions)
        if (!await preCondition(ctx))
          return RouterHandleResponse.create(RouterHandleResponse.Type.UNHANDLED)
      // Since the message context "params" property is readonly we have to set in like this.
      // Please do not handle the params in your route handlers like this.
      // @ts-ignore
      ctx.params = pathAsRegExp.exec(ctx.path)!.groups
      const result = await routeHandler(ctx)
      if (result === undefined) return RouterHandleResponse.create(RouterHandleResponse.Type.HANDLED)
      return RouterHandleResponse.create(RouterHandleResponse.Type.RESULT, result as string | Uint8Array)
    }
  }
}

/** A representation of a router. */
export interface RouterContext extends Servess.RouterContext {
  /** The prefix that the router appends for every route handler. */
  readonly prefix: string
  /** Add a new route handler that is strict on the method used and for a particular path. */
  add(method: string, path: string, handler: RouteHandler): RouteListener
  /** Add a new route handler that is strict on the method used and for the base path. */
  add(method: string, handler: RouteHandler): RouteListener
  /** Add a new route handler that is strict that the method used must be GET and for a particular path. */
  get(path: string, handler: RouteHandler): RouteListener
  /** Add a new route handler that is strict that the method used must be GET and for the base path. */
  get(handler: RouteHandler): RouteListener
  /** Add a new route handler that is strict that the method used must be POST and for a particular path. */
  post(path: string, handler: RouteHandler): RouteListener
  /** Add a new route handler that is strict that the method used must be POST and for the base path. */
  post(handler: RouteHandler): RouteListener
  /** Add a new route handler that is strict that the method used must be PUT and for a particular path. */
  put(path: string, handler: RouteHandler): RouteListener
  /** Add a new route handler that is strict that the method used must be PUT and for the base path. */
  put(handler: RouteHandler): RouteListener
  /** Add a new route handler that is strict that the method used must be DELETE and for a particular path. */
  delete(path: string, handler: RouteHandler): RouteListener
  /** Add a new route handler that is strict that the method used must be DELETE and for the base path. */
  delete(handler: RouteHandler): RouteListener
  /** Add a new route handler that is strict that the method used must be PATCH and for a particular path. */
  patch(path: string, handler: RouteHandler): RouteListener
  /** Add a new route handler that is strict that the method used must be PATCH and for the base path. */
  patch(handler: RouteHandler): RouteListener
  /** Add a new route handler that is strict that the method used must be OPTIONS and for a particular path. */
  options(path: string, handler: RouteHandler): RouteListener
  /** Add a new route handler that is strict that the method used must be OPTIONS and for the base path. */
  options(handler: RouteHandler): RouteListener
  /** Add a new route handler that is strict that the method used must be HEAD and for a particular path. */
  head(path: string, handler: RouteHandler): RouteListener
  /** Add a new route handler that is strict that the method used must be HEAD and for the base path. */
  head(handler: RouteHandler): RouteListener
  /** Add a new route handler that is only strict on the path used. */
  any(path: string, handler: RouteHandler): RouteListener
  /** Add a new route handler that is only strict that the base path must be used. */
  any(handler: RouteHandler): RouteListener
  /** Create a sub router that must have the provided path before any of its decentant route handlers. */
  createRouter(path: string): RouterContext
  /** Make this router handle the passed in message context, returning a RouterHandleResponse */
  handle(context: MessageContext): Promise<RouterHandleResponse.AnyType>
  /** Remove this router from whatever parent router it is a part of. */
  detach(): void
}
export namespace RouterContext {
  export function create(prefix: string = '/', extensions: Extension[] = []): RouterContext {
    const prefixPath =
      prefix.length === 1
        ? prefix === '/'
          ? '/'
          : '/' + prefix + '/'
        : prefix.startsWith('/')
        ? prefix.endsWith('/')
          ? prefix
          : prefix + '/'
        : prefix.endsWith('/')
        ? '/' + prefix
        : '/' + prefix + '/'
    const handlers = [] as Handler[]
    function getPathRegExp(path: string) {
      const fullPath = prefixPath + (path.startsWith('/') ? path.slice(1) : path)
      const fullPathWithParamCutouts = fullPath
        .split('/')
        .map(part => (part.startsWith(':') ? `(?<${part.substring(1)}>[^/]+)` : part))
        .join('/')
        .replace(/\/$/, '/?')
      return new RegExp('^' + (fullPathWithParamCutouts.endsWith('/*') ? fullPathWithParamCutouts.replace(/\/\*$/, '/.*') : fullPathWithParamCutouts + '$'))
    }
    const ctx: RouterContext = {
      prefix,
      add(method: string, path: string | RouteHandler, handler?: RouteHandler) {
        const listener = ctx.any(
          typeof path === 'string' ? path : '',
          typeof path === 'string' ? handler! : path
        )
        const METHOD = method.toUpperCase()
        listener.addPreCondition(ctx => ctx.method === METHOD)
        return listener
      },
      get: (path: string | RouteHandler, handler?: RouteHandler) => typeof path === 'string' ? ctx.add('GET', path, handler!) : ctx.add('GET', '', handler as RouteHandler),
      post: (path: string | RouteHandler, handler?: RouteHandler) => typeof path === 'string' ? ctx.add('POST', path, handler!) : ctx.add('POST', '', handler as RouteHandler),
      put: (path: string | RouteHandler, handler?: RouteHandler) => typeof path === 'string' ? ctx.add('PUT', path, handler!) : ctx.add('PUT', '', handler as RouteHandler),
      delete: (path: string | RouteHandler, handler?: RouteHandler) => typeof path === 'string' ? ctx.add('DELETE', path, handler!) : ctx.add('DELETE', '', handler as RouteHandler),
      patch: (path: string | RouteHandler, handler?: RouteHandler) => typeof path === 'string' ? ctx.add('PATCH', path, handler!) : ctx.add('PATCH', '', handler as RouteHandler),
      options: (path: string | RouteHandler, handler?: RouteHandler) => typeof path === 'string' ? ctx.add('OPTIONS', path, handler!) : ctx.add('OPTIONS', '', handler as RouteHandler),
      head: (path: string | RouteHandler, handler?: RouteHandler) => typeof path === 'string' ? ctx.add('HEAD', path, handler!) : ctx.add('HEAD', '', handler as RouteHandler),
      any(path: string | RouteHandler, handler?: RouteHandler) {
        const pathAsRegExp = getPathRegExp(typeof path === 'string' ? path : '')
        const listener = RouteListener.create(pathAsRegExp, () => handlers.splice(handlers.indexOf(listener)), extensions)
        listener.replaceHandler(typeof path === 'string' ? handler! : path)
        handlers.push(listener)
        return listener
      },
      createRouter(path: string) {
        const router = RouterContext.create(prefixPath + (path.startsWith('/') ? path.slice(1) : path), extensions)
        router.detach = () => {
          const index = handlers.indexOf(router.handle)
          if (index !== -1) handlers.splice(index, 1)
        }
        decorateRouterContext(router, ...extensions)
        handlers.push(router.handle)
        return router
      },
      async handle(context) {
        for (const handler of handlers.slice()) {
          const result = await handler(context)
          if (!RouterHandleResponse.is(result, RouterHandleResponse.Type.UNHANDLED)) return result
        }
        return RouterHandleResponse.create(RouterHandleResponse.Type.UNHANDLED)
      },
      detach: () => void 0
    }
    return ctx
  }
}
