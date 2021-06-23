import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'
import Cookie, { CookieOptions } from './cookie.js'
import Headers from './headers.js'
import QueryObject from './query-object.js'
import { RouteHandler } from './router.js'

export type MimeTypeString = `${string}/${string}` | `${string}/*` | `*/*` | keyof typeof mimeTypeShorthands
type stringable = string | { toString(): string }

export interface MessageContext extends Servess.MessageContext {
  /** The method that was specified in the incoming request. */
  readonly method: string
  /** The full path with the query string if defined. */
  readonly url: string
  /** The full path without the query string. */
  readonly path: string
  /** The query string in a queryable object that has support for multiple values for 1 key. */
  readonly query: QueryObject
  /** An object of the cookies that was recevied from the incoming request. */
  readonly cookies: Record<string, string>
  /** An object of url parameters specified by route paths. Example: '/users/:id' -> { id: 'some id' } */
  readonly params: Record<string, string>
  /** The headers that was received in the incoming request. */
  readonly headers: Headers
  /**
   * Provides the body of the incoming request as a NodeJS readable stream.
   * 
   * If used directly you relenquish the ability to use `bodyAsBuffer`.
   */
  readonly bodyAsStream: NodeJS.ReadableStream
  /**
   * Provides the whole body as a buffer from the incoming request.
   * 
   * If used directly you relenquish the ability to use `bodyAsStream`.
   */
  readonly bodyAsBuffer: Promise<Buffer>
  /** Get the socket that this request was supplied from. */
  readonly socket: Socket
  /**
   * This describes if you or an extension function called `setExternallyHandled`.
   */
  readonly isExternallyHandled: boolean
  /**
   * Describe to the message context that you yourself will handle this request. If the request
   * is going long it is your responibility to call `response.end()`.
   * @param handler The function that will be executed with a IncomingMessage and ServerResponse object.
   */
  setExternalyHandled(handler?: (req: IncomingMessage, res: ServerResponse) => void): void
  /** Get the currently defined status code that the response will have. */
  status(): number
  /** Set the response status code to the defined value. */
  status(status: number): MessageContext
  /** Set a cookie for the client to consume. */
  setCookie(key: string, value: string, options?: CookieOptions | undefined): MessageContext
  /** Set a cookie for the client to consume. */
  setCookie(cookie: Cookie): MessageContext
  /** Remove a cookie that the client has. */
  removeCookie(key: string): MessageContext
  /** Set a response header */
  setHeader(name: string, value: stringable | number | (stringable | number)[] | undefined): MessageContext
  /** Adds a value to response header if it already exists. */
  addHeader(name: string, value: stringable | number | (stringable | number)[] | undefined): MessageContext
  /** Set the response content type to be 'application/json' and stringify the parameter into a string. */
  json<T = any>(json: T): string
  /** Test if the accept header has any of the defined types and return the one that is most prefered. `false` if none match. */
  accepts<Types extends readonly MimeTypeString[]>(...type: Types): Types[number] | false
  /**
   * Simplify the switch case into an object where the key is the content type to test and the value is the handler
   * for that content type. `else` must be defined for any other content type that does not appear as a key.
   */
  accepting(typesObject: { [K: string]: RouteHandler } & { else: RouteHandler }): ReturnType<RouteHandler>
  /** Use a temporary redirect (307) to direct the client to a different location. */
  redirect(location: string): void
  /** Use a permanent redirect (308) to direct the client to a different location. */
  redirectPermanent(location: string): void
  /** Use a permanent redirect (301) to direct the client to a different location. Some very old browsers may not support the 308 status code. */
  redirectPermanentCompat(location: string): void
}

const mimeTypeShorthands = {
  json: 'application/json',
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  javascript: 'text/javascript',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
}

export namespace MessageContext {
  export function create(req: IncomingMessage, res: ServerResponse, responseHeaders: Headers) {
    let path = req.url!
    let query = new QueryObject
    let slashIndex: number
    if ((slashIndex = path.indexOf('?')) !== -1) {
      query = QueryObject.from(path.slice(slashIndex + 1))
      path = path.slice(0, slashIndex)

    }
    let cachedBodyBuffer: Promise<Buffer>
    let responseStatus = 200
    let externallyHandled = false

    const accepts = (() => {
      function calc() {
        return (req.headers.accept ?? '').split(',').map(it => {
          const [mimeType, ...paramsS] = it.split(';').map(it => it.trim())
          return {
            mimeType,
            q: 1,
            ...(paramsS.map(it => it.split('=')).reduce((acc, [name, value]) => {
              if (name === '') return acc
              if (isNaN(+value)) acc[name] = value
              else acc[name] = +value
              return acc
            }, {} as Record<string, string | number>))
          } as {
            mimeType: MimeTypeString,
            q: number
          }
        }).sort((a, b) => b.q - a.q)
      }
      let value: ReturnType<typeof calc>
      return (): typeof value => value === undefined ? (value = calc()) : value
    })()

    const ctx: MessageContext = {
      socket: req.socket,
      method: req.method!,
      url: req.url!,
      path,
      query,
      headers: Headers.from(req.headers),
      cookies: Object.fromEntries(
        (req.headers.cookie || '')
          .trim()
          .split(/ *; */g)
          .map(it => it.split('=').map(decodeURIComponent))
          .filter(([name]) => name !== '' && name !== undefined)
      ),
      bodyAsStream: req,
      get bodyAsBuffer() {
        if (cachedBodyBuffer === void 0) {
          if (req.method === 'GET') return (cachedBodyBuffer = Promise.resolve(Buffer.alloc(0)))
          cachedBodyBuffer = new Promise((resolve, reject) => {
            const chunks: Buffer[] = []
            let totalSize = 0
            if ('content-length' in req.headers) {
              const length = +(req.headers['content-length'] || '0')
              if (length === 0) return resolve(Buffer.alloc(0))

              req.on('data', function accumulator(chunk) {
                chunks.push(chunk)
                totalSize += chunk.length
                if (totalSize >= length) {
                  req.off('data', accumulator)
                  resolve(Buffer.concat(chunks, totalSize))
                }
              })
            } else {
              function accumulator(chunk: Buffer) {
                chunks.push(chunk)
                totalSize += chunk.length
              }
              req.on('data', accumulator).once('end', () => {
                req.off('data', accumulator)
                resolve(Buffer.concat(chunks, totalSize))
              })
            }

            req.once('error', reject)
          })
        }
        return cachedBodyBuffer
      },
      get isExternallyHandled() { return externallyHandled },
      setExternalyHandled(handler) {
        externallyHandled = true
        if (typeof handler === 'function') handler(req, res)
      },
      // @ts-ignore
      status(status?: number) {
        if (status === undefined) return responseStatus
        responseStatus = status
        return ctx
      },
      setCookie(key: string | Cookie, value?: string, options?: CookieOptions) {
        let cookie: Cookie
        if (key instanceof Cookie) {
          cookie = key
        } else {
          cookie = new Cookie(key, value as string, options)
        }
        responseHeaders.add('Set-Cookie', cookie)
        return ctx
      },
      removeCookie(key) {
        ctx.setCookie(key, '', { maxAge: 0 })
        return ctx
      },
      setHeader(name: string, value: number | string | string[] | undefined) {
        if (name.toLowerCase() === 'content-type' && typeof value !== 'number' && (''+value) in mimeTypeShorthands) {
          responseHeaders.set(name, (mimeTypeShorthands as Record<string, string>)[''+value])
        } else {
          responseHeaders.set(name, value)
        }
        return ctx
      },
      addHeader(name: string, value: number | string | string[] | undefined) {
        if (name.toLowerCase() === 'content-type' && typeof value !== 'number' && (''+value) in mimeTypeShorthands) {
          responseHeaders.add(name, (mimeTypeShorthands as Record<string, string>)[''+value])
        } else {
          responseHeaders.add(name, value)
        }
        return ctx
      },
      json(json) {
        ctx.setHeader('Content-Type', 'application/json')
        return JSON.stringify(json)
      },
      accepts<Types extends readonly MimeTypeString[]>(...types: Types): Types[number] | false {
        if (types.length === 0) return false
        let resolvedTypes = types.map(it => it in mimeTypeShorthands
          ? [mimeTypeShorthands[it as keyof typeof mimeTypeShorthands].split('/'), it]
          : [it.split('/'), it]) as [string[], Types[number]][]

        for (const acceptType of accepts()) {
          if (acceptType.mimeType === '*/*') return types[0]
          const [acceptTypeFirst, acceptTypeSecond] = acceptType.mimeType.split('/')
          for (const [[typeFirst, typeSecond], value] of resolvedTypes) {
            if (acceptTypeFirst !== typeFirst) continue
            if (acceptTypeSecond === '*') return value
            if (acceptTypeSecond === typeSecond) return value
          }
        }
        return false
      },
      accepting(obj) {
        const keys = Object.keys(obj)
        if (!keys.includes('else')) throw new Error('Must include a handling for anything else that does not match your defined mime types')
        keys.splice(keys.indexOf('else'), 1)
        if (keys.length > 0) {
          const res = ctx.accepts(...keys as unknown as readonly MimeTypeString[])
          if (res !== false) return obj[res](ctx)
        }
        return obj.else(ctx)
      },
      redirect(location) {
        ctx.status(ctx.method === 'PUT' || ctx.method === 'POST' ? 303 : 307)
        ctx.setHeader('Location', location)
      },
      redirectPermanent(location) {
        ctx.status(ctx.method === 'PUT' || ctx.method === 'POST' ? 303 : 308)
        ctx.setHeader('Location', location)
      },
      redirectPermanentCompat(location) {
        ctx.status(ctx.method === 'PUT' || ctx.method === 'POST' ? 303 : 301)
        ctx.setHeader('Location', location)
      },
    }
    return ctx
  }
}
