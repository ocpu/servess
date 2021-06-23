import { Application } from './index.js'
import { RouteListener, RouterContext } from './router.js'
import { MessageContext } from './message-context.js'
import { Server } from 'http'

export interface Extension {
  readonly name: string

  decorateMessageContext?(ctx: MessageContext): Promise<Partial<MessageContext> | void> | Partial<MessageContext> | void
  decorateRouteListener?(ctx: RouteListener): Promise<Partial<RouteListener> | void> | Partial<RouteListener> | void
  decorateRouterContext?(ctx: RouterContext): Promise<Partial<RouterContext> | void> | Partial<RouterContext> | void
  decorateApplication?(ctx: Application): Promise<Partial<Application> | void> | Partial<Application> | void

  /**
   * Called whenever the application attaches onto a server instance.
   * @param app The app that is attaching to the server instance.
   * @param server The server instance that the application is attaching to.
   */
  onServerAttach?(app: Application, server: Server): Promise<void> | void
  /**
   * Called whenever a new request has reached the server. Called before `onMessage`.
   * @param app The app the request belongs.
   */
  onIncomingMessage?(app: Application): Promise<void> | void
  /**
   * This function is called to when a message context has been recevied.
   * @param ctx The message context that has been created.
   * @param app The app the request belongs.
   */
  onMessage?(ctx: MessageContext, app: Application): Promise<void> | void
  /**
   * This function will be called when the result has been defined and sent to the requester.
   * @param ctx The message context that has been handled.
   * @param app The app the request belongs.
   */
  onMessageHandled?(ctx: MessageContext, app: Application): Promise<void> | void
}

export interface ExtensionFactory<SetupContext> {
  readonly name: string
  createExtensionInstance(setup: (ctx: SetupContext) => void): Extension
}
