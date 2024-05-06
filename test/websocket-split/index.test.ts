import { createTRPCClient } from '@trpc/client'
import { observable } from '@trpc/server/observable'

import { setupServer } from 'msw/node'
import { describe, test, beforeAll, afterAll, expect, afterEach } from 'vitest'

import { createLinks } from './links'
import { AppRouter, NestedAppRouter, User } from '../routers'
import createTRPCMsw from '../../src/createTRPCMsw'
import { createWSClient, httpLink, splitLink, wsLink } from '../../src/links'

const mswLinks = [
  splitLink({
    condition: op => op.type === 'subscription',
    true: wsLink({
      client: createWSClient({
        url: 'ws://localhost:3001',
      }),
    }),
    false: httpLink({
      url: 'http://localhost:3000/trpc',
    }),
  }),
]

describe('with ws link', () => {
  const server = setupServer()

  beforeAll(() => server.listen())
  afterAll(() => server.close())

  describe('simple router', () => {
    const mswTrpc = createTRPCMsw<AppRouter>({ links: mswLinks })

    afterEach(() => server.resetHandlers())

    test('handles queries properly', async () => {
      server.use(mswTrpc.userById.query(() => ({ id: '1', name: 'Malo' })))

      const trpc = createTRPCClient<AppRouter>({ links: createLinks() })
      const user = await trpc.userById.query('1')

      expect(user).toEqual({ id: '1', name: 'Malo' })
    })

    test('handles mutations properly', async () => {
      server.use(mswTrpc.createUser.mutation(name => ({ id: '2', name })))

      const trpc = createTRPCClient<AppRouter>({ links: createLinks() })
      const user = await trpc.createUser.mutate('Robert')

      expect(user).toEqual({ id: '2', name: 'Robert' })
    })

    test('handles subscriptions properly', async () => {
      server.use(
        mswTrpc.getUserUpdates.subscription(id => {
          return observable(emit => {
            setTimeout(() => {
              emit.next({ id, name: 'Toto' })
            }, 1000)
          })
        }),
      )

      const trpc = createTRPCClient<AppRouter>({ links: createLinks() })

      const promise = new Promise<User>(resolve => {
        trpc.getUserUpdates.subscribe('3', {
          onData: resolve,
        })
      })

      await expect(promise).resolves.toEqual({ id: '3', name: 'Toto' })
    })

    test('can receive multiple subscription updates', async () => {
      server.use(
        mswTrpc.getUserUpdates.subscription(id => {
          return observable(emit => {
            const names = ['Toto', 'Tutu', 'Titi']

            names.forEach((name, i) => {
              setTimeout(() => {
                emit.next({ id, name })
              }, i * 50)
            })
          })
        }),
      )

      const trpc = createTRPCClient<AppRouter>({ links: createLinks() })

      const promise = new Promise<User[]>(resolve => {
        const results: User[] = []
        trpc.getUserUpdates.subscribe('4', {
          onData: data => {
            results.push(data)
            if (results.length === 3) {
              resolve(results)
            }
          },
        })
      })

      await expect(promise).resolves.toEqual([
        { id: '4', name: 'Toto' },
        { id: '4', name: 'Tutu' },
        { id: '4', name: 'Titi' },
      ])
    })
  })

  describe('nested router', () => {
    const mswTrpc = createTRPCMsw<NestedAppRouter>({ links: mswLinks })

    afterEach(() => server.resetHandlers())

    test('handles queries properly', async () => {
      server.use(mswTrpc.deeply.nested.userById.query(() => ({ id: '1', name: 'Malo' })))

      const trpc = createTRPCClient<NestedAppRouter>({ links: createLinks() })
      const user = await trpc.deeply.nested.userById.query('1')

      expect(user).toEqual({ id: '1', name: 'Malo' })
    })

    test('handles mutations properly', async () => {
      server.use(mswTrpc.deeply.nested.createUser.mutation(name => ({ id: '2', name })))

      const trpc = createTRPCClient<NestedAppRouter>({ links: createLinks() })
      const user = await trpc.deeply.nested.createUser.mutate('Robert')

      expect(user).toEqual({ id: '2', name: 'Robert' })
    })

    test('handles subscriptions properly', async () => {
      server.use(
        mswTrpc.deeply.nested.getUserUpdates.subscription(id => {
          return observable(emit => {
            setTimeout(() => {
              emit.next({ id, name: 'Tutu' })
            }, 1000)
          })
        }),
      )

      const trpc = createTRPCClient<NestedAppRouter>({ links: createLinks() })

      const promise = new Promise<User>(resolve => {
        trpc.deeply.nested.getUserUpdates.subscribe('21', {
          onData: resolve,
        })
      })

      await expect(promise).resolves.toEqual({ id: '21', name: 'Tutu' })
    })
  })
})