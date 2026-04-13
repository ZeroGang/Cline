import { describe, it, expect, beforeEach } from 'vitest'
import { ApiServer, createApiServer, createAuthMiddleware, type ApiRequest, type ApiResponse } from '../../src/api/server.js'

describe('ApiServer', () => {
  let server: ApiServer

  beforeEach(() => {
    server = createApiServer({ port: 3000 })
  })

  describe('route registration', () => {
    it('should register GET route', () => {
      server.get('/test', async () => server.json({ success: true }))
      
      const routes = (server as any).routes as Array<{ method: string; path: string }>
      expect(routes.some(r => r.method === 'GET' && r.path === '/test')).toBe(true)
    })

    it('should register POST route', () => {
      server.post('/test', async () => server.json({ success: true }))
      
      const routes = (server as any).routes as Array<{ method: string; path: string }>
      expect(routes.some(r => r.method === 'POST' && r.path === '/test')).toBe(true)
    })

    it('should register PUT route', () => {
      server.put('/test', async () => server.json({ success: true }))
      
      const routes = (server as any).routes as Array<{ method: string; path: string }>
      expect(routes.some(r => r.method === 'PUT' && r.path === '/test')).toBe(true)
    })

    it('should register DELETE route', () => {
      server.delete('/test', async () => server.json({ success: true }))
      
      const routes = (server as any).routes as Array<{ method: string; path: string }>
      expect(routes.some(r => r.method === 'DELETE' && r.path === '/test')).toBe(true)
    })
  })

  describe('handleRequest', () => {
    it('should return 404 for unknown route', async () => {
      const req: ApiRequest = {
        method: 'GET',
        path: '/unknown',
        headers: {},
        query: {}
      }

      const response = await server.handleRequest(req)
      expect(response.status).toBe(404)
    })

    it('should handle GET request', async () => {
      server.get('/test', async () => server.json({ message: 'hello' }))

      const req: ApiRequest = {
        method: 'GET',
        path: '/test',
        headers: {},
        query: {}
      }

      const response = await server.handleRequest(req)
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ message: 'hello' })
    })

    it('should handle POST request with body', async () => {
      server.post('/test', async (req) => server.json({ received: req.body }))

      const req: ApiRequest = {
        method: 'POST',
        path: '/test',
        headers: {},
        query: {},
        body: { data: 'test' }
      }

      const response = await server.handleRequest(req)
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ received: { data: 'test' } })
    })

    it('should handle path parameters', async () => {
      server.get('/users/:id', async (req) => {
        const id = req.path.split('/')[2]
        return server.json({ userId: id })
      })

      const req: ApiRequest = {
        method: 'GET',
        path: '/users/123',
        headers: {},
        query: {}
      }

      const response = await server.handleRequest(req)
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ userId: '123' })
    })

    it('should return 401 for protected route without auth', async () => {
      server.get('/protected', async () => server.json({ secret: 'data' }), { auth: true })

      const req: ApiRequest = {
        method: 'GET',
        path: '/protected',
        headers: {},
        query: {}
      }

      const response = await server.handleRequest(req)
      expect(response.status).toBe(401)
    })

    it('should allow access to protected route with auth', async () => {
      server.get('/protected', async () => server.json({ secret: 'data' }), { auth: true })

      const req: ApiRequest = {
        method: 'GET',
        path: '/protected',
        headers: {},
        query: {},
        user: { id: 'user-1', roles: ['user'] }
      }

      const response = await server.handleRequest(req)
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ secret: 'data' })
    })

    it('should return 403 for insufficient roles', async () => {
      server.get('/admin', async () => server.json({ admin: 'data' }), { 
        auth: true, 
        roles: ['admin'] 
      })

      const req: ApiRequest = {
        method: 'GET',
        path: '/admin',
        headers: {},
        query: {},
        user: { id: 'user-1', roles: ['user'] }
      }

      const response = await server.handleRequest(req)
      expect(response.status).toBe(403)
    })

    it('should allow access with correct role', async () => {
      server.get('/admin', async () => server.json({ admin: 'data' }), { 
        auth: true, 
        roles: ['admin'] 
      })

      const req: ApiRequest = {
        method: 'GET',
        path: '/admin',
        headers: {},
        query: {},
        user: { id: 'user-1', roles: ['admin'] }
      }

      const response = await server.handleRequest(req)
      expect(response.status).toBe(200)
    })
  })

  describe('middleware', () => {
    it('should execute middleware', async () => {
      const order: string[] = []

      server.use(async (req, next) => {
        order.push('middleware1')
        return next()
      })

      server.use(async (req, next) => {
        order.push('middleware2')
        return next()
      })

      server.get('/test', async () => {
        order.push('handler')
        return server.json({ success: true })
      })

      const req: ApiRequest = {
        method: 'GET',
        path: '/test',
        headers: {},
        query: {}
      }

      await server.handleRequest(req)
      expect(order).toEqual(['middleware1', 'middleware2', 'handler'])
    })

    it('should allow middleware to short-circuit', async () => {
      server.use(async (req, next) => {
        return server.errorResponse(403, 'Blocked by middleware')
      })

      server.get('/test', async () => server.json({ success: true }))

      const req: ApiRequest = {
        method: 'GET',
        path: '/test',
        headers: {},
        query: {}
      }

      const response = await server.handleRequest(req)
      expect(response.status).toBe(403)
    })
  })

  describe('error handling', () => {
    it('should handle handler errors', async () => {
      server.get('/error', async () => {
        throw new Error('Handler error')
      })

      const req: ApiRequest = {
        method: 'GET',
        path: '/error',
        headers: {},
        query: {}
      }

      const response = await server.handleRequest(req)
      expect(response.status).toBe(500)
    })
  })

  describe('OpenAPI spec', () => {
    it('should generate OpenAPI spec', () => {
      server.get('/tasks', async () => server.json({ tasks: [] }))
      server.post('/tasks', async () => server.json({}), { auth: true })

      const spec = server.getOpenApiSpec() as any

      expect(spec.openapi).toBe('3.0.0')
      expect(spec.paths['/tasks']).toBeDefined()
      expect(spec.paths['/tasks'].get).toBeDefined()
      expect(spec.paths['/tasks'].post).toBeDefined()
      expect(spec.paths['/tasks'].post.security).toEqual([{ bearerAuth: [] }])
    })
  })
})

describe('createAuthMiddleware', () => {
  it('should allow requests without API key configured', async () => {
    const middleware = createAuthMiddleware()
    const server = createApiServer()
    
    let called = false
    server.get('/test', async () => {
      called = true
      return server.json({ success: true })
    })
    
    server.use(middleware)

    const req: ApiRequest = {
      method: 'GET',
      path: '/test',
      headers: {},
      query: {}
    }

    const response = await server.handleRequest(req)
    expect(called).toBe(true)
    expect(response.status).toBe(200)
  })

  it('should reject requests without auth header', async () => {
    const middleware = createAuthMiddleware('secret-key')
    const server = createApiServer()
    
    server.use(middleware)
    server.get('/test', async () => server.json({ success: true }))

    const req: ApiRequest = {
      method: 'GET',
      path: '/test',
      headers: {},
      query: {}
    }

    const response = await server.handleRequest(req)
    expect(response.status).toBe(401)
  })

  it('should reject requests with invalid API key', async () => {
    const middleware = createAuthMiddleware('secret-key')
    const server = createApiServer()
    
    server.use(middleware)
    server.get('/test', async () => server.json({ success: true }))

    const req: ApiRequest = {
      method: 'GET',
      path: '/test',
      headers: { authorization: 'Bearer wrong-key' },
      query: {}
    }

    const response = await server.handleRequest(req)
    expect(response.status).toBe(401)
  })

  it('should allow requests with valid API key', async () => {
    const middleware = createAuthMiddleware('secret-key')
    const server = createApiServer()
    
    server.use(middleware)
    server.get('/test', async () => server.json({ success: true }))

    const req: ApiRequest = {
      method: 'GET',
      path: '/test',
      headers: { authorization: 'Bearer secret-key' },
      query: {}
    }

    const response = await server.handleRequest(req)
    expect(response.status).toBe(200)
  })
})
