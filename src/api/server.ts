import { Logger } from '../infrastructure/logging/logger.js'

export interface ApiRequest {
  method: string
  path: string
  headers: Record<string, string>
  query: Record<string, string>
  body?: unknown
  user?: { id: string; roles: string[] }
}

export interface ApiResponse {
  status: number
  headers?: Record<string, string>
  body?: unknown
}

export type RouteHandler = (req: ApiRequest) => Promise<ApiResponse>

export interface Route {
  method: string
  path: string
  handler: RouteHandler
  middleware?: Middleware[]
  auth?: boolean
  roles?: string[]
}

export type Middleware = (req: ApiRequest, next: () => Promise<ApiResponse>) => Promise<ApiResponse>

export interface ApiServerConfig {
  port: number
  host: string
  apiKey?: string
  jwtSecret?: string
}

const DEFAULT_CONFIG: ApiServerConfig = {
  port: 3000,
  host: 'localhost'
}

export class ApiServer {
  private config: ApiServerConfig
  private logger: Logger
  private routes: Route[] = []
  private middleware: Middleware[] = []

  constructor(config: Partial<ApiServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.logger = new Logger({ source: 'ApiServer' })
  }

  use(middleware: Middleware): void {
    this.middleware.push(middleware)
  }

  route(route: Route): void {
    this.routes.push(route)
    this.logger.debug('Route registered', { method: route.method, path: route.path })
  }

  get(path: string, handler: RouteHandler, options?: Partial<Route>): void {
    this.route({ method: 'GET', path, handler, ...options })
  }

  post(path: string, handler: RouteHandler, options?: Partial<Route>): void {
    this.route({ method: 'POST', path, handler, ...options })
  }

  put(path: string, handler: RouteHandler, options?: Partial<Route>): void {
    this.route({ method: 'PUT', path, handler, ...options })
  }

  delete(path: string, handler: RouteHandler, options?: Partial<Route>): void {
    this.route({ method: 'DELETE', path, handler, ...options })
  }

  async handleRequest(req: ApiRequest): Promise<ApiResponse> {
    const route = this.findRoute(req.method, req.path)
    
    if (!route) {
      return this.errorResponse(404, 'Not Found')
    }

    if (route.auth && !req.user) {
      return this.errorResponse(401, 'Unauthorized')
    }

    if (route.roles && route.roles.length > 0) {
      const user = req.user
      if (!user || !route.roles.some(role => user.roles.includes(role))) {
        return this.errorResponse(403, 'Forbidden')
      }
    }

    const handlers: RouteHandler[] = [...this.middleware.map(m => (req: ApiRequest) => m(req, async () => this.errorResponse(500, 'Middleware chain broken'))), ...(route.middleware?.map(m => (req: ApiRequest) => m(req, async () => this.errorResponse(500, 'Middleware chain broken'))) || []), route.handler]
    
    return this.executeMiddlewareChain(req, handlers)
  }

  private findRoute(method: string, path: string): Route | undefined {
    return this.routes.find(route => {
      if (route.method !== method) return false
      
      const routeParts = route.path.split('/').filter(Boolean)
      const pathParts = path.split('/').filter(Boolean)
      
      if (routeParts.length !== pathParts.length) return false
      
      return routeParts.every((part, i) => {
        return part.startsWith(':') || part === pathParts[i]
      })
    })
  }

  private async executeMiddlewareChain(
    req: ApiRequest,
    handlers: RouteHandler[]
  ): Promise<ApiResponse> {
    let index = 0

    const next = async (): Promise<ApiResponse> => {
      if (index >= handlers.length) {
        return this.errorResponse(500, 'No handler found')
      }

      const handler = handlers[index++]
      if (!handler) {
        return this.errorResponse(500, 'Handler not found')
      }
      
      if (index < handlers.length) {
        return handler(req)
      }
      
      return handler(req)
    }

    try {
      return await next()
    } catch (error) {
      this.logger.error('Request handler error', { error })
      return this.errorResponse(500, 'Internal Server Error')
    }
  }

  json(body: unknown, status: number = 200): ApiResponse {
    return {
      status,
      headers: { 'Content-Type': 'application/json' },
      body
    }
  }

  errorResponse(status: number, message: string): ApiResponse {
    return this.json({ error: message }, status)
  }

  getOpenApiSpec(): object {
    const paths: Record<string, Record<string, object>> = {}

    for (const route of this.routes) {
      const pathKey = route.path.replace(/:([^/]+)/g, '{$1}')
      
      if (!paths[pathKey]) {
        paths[pathKey] = {}
      }

      paths[pathKey][route.method.toLowerCase()] = {
        summary: `${route.method} ${route.path}`,
        security: route.auth ? [{ bearerAuth: [] }] : undefined,
        responses: {
          200: {
            description: 'Success',
            content: {
              'application/json': {
                schema: { type: 'object' }
              }
            }
          },
          401: route.auth ? { description: 'Unauthorized' } : undefined,
          403: route.roles ? { description: 'Forbidden' } : undefined
        }
      }
    }

    return {
      openapi: '3.0.0',
      info: {
        title: 'CLine API',
        version: '1.0.0',
        description: 'CLine Scheduler API'
      },
      paths,
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer'
          }
        }
      }
    }
  }

  getConfig(): ApiServerConfig {
    return { ...this.config }
  }
}

export function createApiServer(config?: Partial<ApiServerConfig>): ApiServer {
  return new ApiServer(config)
}

export function createAuthMiddleware(apiKey?: string): Middleware {
  return async (req, next) => {
    if (!apiKey) {
      return next()
    }

    const authHeader = req.headers['authorization']
    if (!authHeader) {
      return {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Missing authorization header' }
      }
    }

    const token = authHeader.replace('Bearer ', '')
    if (token !== apiKey) {
      return {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Invalid API key' }
      }
    }

    req.user = { id: 'api-user', roles: ['user'] }
    return next()
  }
}
