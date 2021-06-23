import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import { AddressInfo, Socket } from 'net'
import { Extension, ExtensionFactory } from './extension.js'
import Headers from './headers.js'
import { decorateApplication, decorateMessageContext, decorateRouterContext, doLifecycle } from './internal-util.js'
import { MessageContext } from './message-context.js'
import { RouteHandler, RouterContext, RouterHandleResponse } from './router.js'

export { default as Cookie } from './cookie.js'
export type { CookieOptions } from './cookie.js'
export * from './router.js'
export * from './message-context.js'
export { default as QueryObject } from './query-object.js'
export { default as Headers } from './headers.js'

declare global {
  namespace Servess {
    // The interfaces here are for extensions so that they can extend the handler context
    // when handling them in a route handler.
    interface Application {}
    interface RouterContext {}
    interface MessageContext {}
    interface RouteListener {}
  }
}

type ExtensionFactoryParam<SetupContext> =
  | ExtensionFactory<SetupContext>
  | Promise<ExtensionFactory<SetupContext>>
  | { default: ExtensionFactory<SetupContext> }
  | Promise<{ default: ExtensionFactory<SetupContext> }>

/**
 * A representation of a server application.
 */
export interface Application extends RouterContext, Servess.Application {
  // For use directly with `require('http').createServer(app)`
  (req: IncomingMessage, res: ServerResponse): void
  readonly closed: boolean
  /**
   * Install an extension to extend the functionallity of the server application.
   * The first parameter is a extension instance factory that creates new extension
   * instances that are a part of just one application. The second parameter is a
   * function that takes a setup context that can specialize the extension instance
   * to that application.
   *
   * Extensions have hooks to extend the application it is installed into, router
   * contexts that are created as part of this application or sub routers, and
   * message contexts for incoming requests.
   *
   * @param extensionFactory An extension factory object or a promise resolving into one.
   * @param setup The function that may or may not be called for additional setup of the extension.
   */
  install<SetupContext>(
    extensionFactory: ExtensionFactoryParam<SetupContext>,
    setup?: (ctx: SetupContext) => void
  ): Promise<void>
  /**
   * Starts the application on the port specified. It returns a promise for when it
   * has started to listen on connections.
   * @param port The port the application server should start to listen on incoming connection on.
   */
  listen(port: number): Promise<void>
  /**
   * Attach the application onto an existing server.
   * @param server The server to attach to.
   */
  attach(server: Server): Promise<void>
  /**
   * Get the address this application server is listening on. If it is not defined
   * it returns undefined.
   */
  address(): AddressInfo | undefined
  /**
   * Close the application server. If there are any dangling connection at this
   * time they are destroyed.
   *
   * @returns A promise that resolved when the server is fully closed.
   */
  close(): Promise<void>
  /**
   * When a route handler throws an error this function will be called.
   */
  onError(handler: (message: MessageContext, error: unknown) => ReturnType<RouteHandler>): void
  /**
   * When no route matches the request this function will be called.
   */
  onUnhandled(handler: RouteHandler): void
}

const getDefaultHTML404Page = (path: string) =>
  Buffer.from(
    `
<!DOCTYPE html>
<html>
  <head>
    <title>404 - Not Found</title>
  </head>
  <body>
    <h1>404 - Not Found</h1>
    <p>Cannot find any resource at ${path}</p>
  </body>
</html>
`
      .slice(1)
      .replace(/(?<=[>])(?:\r?\n|\r)[ ]*/g, '')
      .replace(/(?:\r?\n|\r)[ ]*/g, ' ')
  )

const getDefaultHTML500Page = (path: string, error: unknown) =>
  Buffer.from(
    `
<!DOCTYPE html>
<html>
  <head>
    <title>500 - Internal Server Error</title>
  </head>
  <body>
    <h1>500 - Internal Server Error</h1>
    <p>An error happened while handling the route ${path}</p>
    ${
      process.env.NODE_ENV !== 'production'
        ? `<pre>${'' + error}</pre>`
        : ''
    }
  </body>
</html>
`
      .slice(1)
      .replace(/(?<=[>])(?:\r?\n|\r)[ ]*/g, '')
      .replace(/(?:\r?\n|\r)[ ]*/g, ' ')
  )

/**
 * Creates an application instance. You can specify a base path as an argument
 * if the whole application has a requirement to serve connection only at a
 * specific base path.
 *
 * @param basePath The path that is the base for all route handlers
 */
export default function createApp(basePath: string = '/'): Application {
  const extensions: Extension[] = []
  let onError: ((message: MessageContext, error: unknown) => ReturnType<RouteHandler>) | undefined
  let onUnhandled: RouteHandler | undefined
  let closeFunction: () => Promise<void> = () => Promise.resolve()
  let addressFunction: () => AddressInfo | undefined = () => undefined
  let app: Application
  return (app = Object.assign(
    handlerFunction,
    {
      closed: false,
      async attach(server: Server) {
        const sockets: Socket[] = []
        let closing = false
        server.on('request', (req, res) => handlerFunction(req, res))
        server.on('close', () => {
          if (!closing) closeFunction()
        })
        server.on('connection', socket => {
          sockets.push(socket)
          socket.on('close', () => {
            if (!closing) sockets.splice(sockets.indexOf(socket), 1)
          })
        })
        addressFunction = () => {
          const addr = server.address()
          if (typeof addr === 'object' && addr !== null) return addr
          return undefined
        }
        closeFunction = () => {
          return new Promise(async (resolve, reject) => {
            closing = true
            await Promise.all(
              sockets.map(socket => {
                return new Promise<void>((resolveSocketClose, rejectSocketClose) => {
                  socket.on('close', () => resolveSocketClose())
                  socket.on('error', rejectSocketClose)
                  socket.destroy()
                })
              })
            )
            server.close(err => (err === undefined ? resolve() : reject(err)))
          })
        }

        await doLifecycle(extensions, 'onServerAttach', app, server)
      },
      listen(port: number) {
        return new Promise(async (resolve, reject) => {
          const server = createServer()
          server.on('listening', resolve)
          server.on('error', reject)
          await app.attach(server)
          server.listen(port)
        })
      },
      address: () => addressFunction?.(),
      async install<SetupContext>(factory: ExtensionFactoryParam<SetupContext>, setup?: (ctx: SetupContext) => void) {
        const factoryParam = await factory
        const extensionFactory = isExtensionFactory(factoryParam) ? factoryParam : factoryParam.default
        const extension = extensionFactory.createExtensionInstance(setup ?? (() => {}))
        extensions.push(extension)
        await decorateRouterContext(app, extension)
        await decorateApplication(app, extension)

        function isExtensionFactory(obj: unknown): obj is ExtensionFactory<SetupContext> {
          return (
            typeof obj === 'object' &&
            obj !== null &&
            typeof (obj as any).name === 'string' &&
            typeof (obj as any).createExtensionInstance === 'function'
          )
        }
      },
      async close() {
        if (!app.closed) {
          // @ts-ignore
          app.closed = true
          await closeFunction?.()
        }
      },
      onError(handler: typeof onError) {
        onError = handler
      },
      onUnhandled(handler: typeof onUnhandled) {
        onUnhandled = handler
      },
    },
    RouterContext.create(basePath, extensions)
  ) as Application)

  async function handlerFunction(req: IncomingMessage, res: ServerResponse) {
    await doLifecycle(extensions, 'onIncomingMessage', app)

    const headers = new Headers()
    const message = MessageContext.create(req, res, headers)
    await decorateMessageContext(message, ...extensions)
    await doLifecycle(extensions, 'onMessage', message, app)

    let handleResult: RouterHandleResponse.AnyType
    try {
      handleResult = await app.handle(message)
    } catch (error) {
      if (onError !== undefined) {
        const errorRes = await onError(message, error)
        handleResult =
          errorRes !== undefined
            ? RouterHandleResponse.create(RouterHandleResponse.Type.RESULT, errorRes)
            : RouterHandleResponse.create(RouterHandleResponse.Type.HANDLED)
      } else {
        message.status(500).accepting({
          html: () => respond('text/html; charset=UTF-8', getDefaultHTML500Page(message.path, error)),
          json: () => {
            respond(
              'application/json; charset=UTF-8',
              Buffer.from(JSON.stringify({ status: 500, message: 'Internal Server Error' }))
            )
          },
          else: () => respond('text/plain; charset=UTF-8', Buffer.from('500 Internal Server Error')),
        })
        await doLifecycle(extensions, 'onMessageHandled', message, app)
        return
      }
    }
    if (RouterHandleResponse.is(handleResult, RouterHandleResponse.Type.UNHANDLED) && onUnhandled !== undefined) {
      const errorRes = await onUnhandled(message)
      handleResult =
        errorRes !== undefined
          ? RouterHandleResponse.create(RouterHandleResponse.Type.RESULT, errorRes)
          : RouterHandleResponse.create(RouterHandleResponse.Type.HANDLED)
    }
    if (RouterHandleResponse.is(handleResult, RouterHandleResponse.Type.RESULT)) {
      if (handleResult.result instanceof Uint8Array) {
        respond('application/octet-stream', handleResult.result)
      } else if (typeof handleResult.result === 'string') {
        respond('text/plain; charset=UTF-8', Buffer.from(handleResult.result, 'utf8'))
      } else {
        res.writeHead(message.status(), headers.toJSON())
        handleResult.result.pipe(res)
      }
    } else if (RouterHandleResponse.is(handleResult, RouterHandleResponse.Type.UNHANDLED)) {
      message.status(404).accepting({
        html: () => respond('text/html; charset=UTF-8', getDefaultHTML404Page(message.path)),
        json: () => {
          respond('application/json; charset=UTF-8', Buffer.from(JSON.stringify({ status: 404, message: 'Not Found' })))
        },
        else: () => respond('text/plain; charset=UTF-8', Buffer.from('404 Not Found')),
      })
    } else if (!message.isExternallyHandled) {
      res.writeHead(message.status(), headers.toJSON()).end()
    }
    await doLifecycle(extensions, 'onMessageHandled', message, app)

    function respond(mimeType: string, buffer: Uint8Array) {
      if (!headers.has('Content-Type')) headers.set('Content-Type', mimeType)
      if (!headers.has('Content-Length')) headers.set('Content-Length', buffer.byteLength)
      res.writeHead(message.status(), headers.toJSON())
      res.end(buffer)
    }
  }
}
