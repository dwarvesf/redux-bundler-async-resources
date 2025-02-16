import timekeeper from 'timekeeper'
import { createReactorBundle, appTimeBundle, composeBundlesRaw } from 'redux-bundler'

import MockApiClient from '../__mocks__/MockApiClient'
import { createAsyncResourceBundle } from '../index'

const START_TIME = 1000

describe('createAsyncResourceBundle', () => {
  beforeEach(() => timekeeper.freeze(START_TIME))

  afterEach(() => timekeeper.reset())

  test('provides declared interface', () => {
    const { store } = createStore()

    expect(store.selectTestResourceRaw).toBeDefined()
    expect(store.selectTestResource).toBeDefined()
    expect(store.selectTestResourceDependencyValues).toBeDefined()
    expect(store.selectTestResourceIsPresent).toBeDefined()
    expect(store.selectTestResourceIsLoading).toBeDefined()
    expect(store.selectTestResourceIsPendingForFetch).toBeDefined()
    expect(store.selectTestResourceError).toBeDefined()
    expect(store.selectTestResourceIsReadyForRetry).toBeDefined()
    expect(store.selectTestResourceRetryAt).toBeDefined()
    expect(store.selectTestResourceErrorIsPermanent).toBeDefined()
    expect(store.selectTestResourceIsStale).toBeDefined()

    expect(store.doFetchTestResource).toBeDefined()
    expect(store.doClearTestResource).toBeDefined()
    expect(store.doMarkTestResourceAsStale).toBeDefined()
    expect(store.doAdjustTestResource).toBeDefined()
  })

  test('checks for required parameters', () => {
    expect(() => createStore({ name: '' })).toThrow('createAsyncResourceBundle: name parameter is required')
    expect(() => createStore({ getPromise: '' })).toThrow('createAsyncResourceBundle: getPromise parameter is required')
  })

  test('correctly handles item initial state', () => {
    const { store } = createStore()

    assertItem(store, {
      data: undefined,
      isLoading: false,
      isPresent: false,
      isPendingForFetch: true,
      error: null,
      errorPermanent: false,
      isStale: false,
      isReadyForRetry: false,
    })
  })

  test('correctly handles item loading state', () => {
    const { store } = createStore()

    store.doFetchTestResource()

    assertItem(store, {
      data: undefined,
      isLoading: true,
      isPresent: false,
      isPendingForFetch: false,
      error: null,
      errorPermanent: false,
      isStale: false,
      isReadyForRetry: false,
    })
  })

  test('loads an item when requested', async () => {
    const { store, apiMock } = createStore()

    store.doFetchTestResource()

    expect(apiMock.pendingQueueCount(1)).toBe(1)
    await apiMock.resolveFetchRequest(1)

    assertItem(store, {
      data: 'One',
      isLoading: false,
      isPresent: true,
      isPendingForFetch: false,
      error: null,
      errorPermanent: false,
      isStale: false,
      isReadyForRetry: false,
    })
  })

  test('correctly handles item error state', async () => {
    const { store, apiMock } = createStore()

    store.doFetchTestResource()

    await apiMock.resolveFetchRequest(1, 'error!')

    assertItem(store, {
      data: undefined,
      isLoading: false,
      isPresent: false,
      isPendingForFetch: false,
      error: 'error!',
      errorPermanent: false,
      isStale: false,
      isReadyForRetry: false,
    })
  })

  test('correctly handles error state on re-fetch', async () => {
    const { store, apiMock } = createStore()

    store.doFetchTestResource()
    await apiMock.resolveFetchRequest(1)

    store.doFetchTestResource()
    await apiMock.resolveFetchRequest(1, 'error!')

    assertItem(store, {
      data: 'One',
      isLoading: false,
      isPresent: true,
      isPendingForFetch: false,
      error: 'error!',
      errorPermanent: false,
      isStale: false,
      isReadyForRetry: false,
    })
  })

  test('marks item for a retry after specified interval', async () => {
    const { store, apiMock } = createStore({ retryAfter: 10 })

    store.doFetchTestResource()

    await apiMock.resolveFetchRequest(1, 'error!')

    await timeTravelTo(9, store)

    assertItem(store, {
      data: undefined,
      isLoading: false,
      isPresent: false,
      isPendingForFetch: false,
      error: 'error!',
      errorPermanent: false,
      isStale: false,
      isReadyForRetry: false,
    })

    await timeTravelTo(11, store)

    assertItem(store, {
      data: undefined,
      isLoading: false,
      isPresent: false,
      isPendingForFetch: true,
      error: 'error!',
      errorPermanent: false,
      isStale: false,
      isReadyForRetry: true,
    })
  })

  test('does not mark item for a retry if error is permanent', async () => {
    const { store, apiMock } = createStore({ retryAfter: 10 })
    const error = { message: 'error!', permanent: true }

    store.doFetchTestResource()

    await apiMock.resolveFetchRequest(1, error)

    await timeTravelTo(15, store)

    assertItem(store, {
      data: undefined,
      isLoading: false,
      isPresent: false,
      isPendingForFetch: false,
      error: error,
      errorPermanent: true,
      isStale: false,
      isReadyForRetry: false,
    })
  })

  test('marks item as stale manually', async () => {
    const { store, apiMock } = createStore({ staleAfter: 15 })

    store.doFetchTestResource()

    await apiMock.resolveFetchRequest(1)

    store.doMarkTestResourceAsStale()

    assertItem(store, {
      data: 'One',
      isLoading: false,
      isPresent: true,
      isPendingForFetch: true,
      error: null,
      errorPermanent: false,
      isStale: true,
      isReadyForRetry: false,
    })

    await timeTravelTo(16, store)

    assertItem(store, {
      data: 'One',
      isLoading: false,
      isPresent: true,
      isPendingForFetch: true,
      error: null,
      errorPermanent: false,
      isStale: true,
      isReadyForRetry: false,
    })
  })

  test('marks item as stale with a timer', async () => {
    const { store, apiMock } = createStore({ staleAfter: 15 })

    store.doFetchTestResource()

    await apiMock.resolveFetchRequest(1)

    assertItem(store, {
      data: 'One',
      isLoading: false,
      isPresent: true,
      isPendingForFetch: false,
      error: null,
      errorPermanent: false,
      isStale: false,
      isReadyForRetry: false,
    })

    await timeTravelTo(16, store)

    assertItem(store, {
      data: 'One',
      isLoading: false,
      isPresent: true,
      isPendingForFetch: true,
      error: null,
      errorPermanent: false,
      isStale: true,
      isReadyForRetry: false,
    })
  })

  test("clears an item from the store when it's expired", async () => {
    const { store, apiMock } = createStore({ expireAfter: 20 })

    store.doFetchTestResource()
    await apiMock.resolveFetchRequest(1)

    await timeTravelTo(21, store)

    assertItem(store, {
      data: undefined,
      isLoading: false,
      isPresent: false,
      isPendingForFetch: true,
      error: null,
      errorPermanent: false,
      isStale: false,
      isReadyForRetry: false,
    })
  })

  test("does not expire items that don't have data", async () => {
    const { store, apiMock } = createStore({ expireAfter: 20 })

    store.doFetchTestResource()
    await apiMock.resolveFetchRequest(1, 'error!')

    await timeTravelTo(21, store)

    assertItem(store, {
      data: undefined,
      isLoading: false,
      isPresent: false,
      isPendingForFetch: false,
      error: 'error!',
      errorPermanent: false,
      isStale: false,
      isReadyForRetry: false,
    })
  })

  test('expires items that are pending for a retry', async () => {
    const { store, apiMock } = createStore({ expireAfter: 20 })

    store.doFetchTestResource()
    await apiMock.resolveFetchRequest(1)

    store.doFetchTestResource()
    await apiMock.resolveFetchRequest(1, 'error!')

    await timeTravelTo(21, store)

    assertItem(store, {
      data: undefined,
      isLoading: false,
      isPresent: false,
      isPendingForFetch: true,
      error: null,
      errorPermanent: false,
      isStale: false,
      isReadyForRetry: false,
    })
  })

  test('allows to clear an item from the store', async () => {
    const { store, apiMock } = createStore({ expireAfter: 20 })

    store.doFetchTestResource()
    await apiMock.resolveFetchRequest(1)

    store.doClearTestResource()

    assertItem(store, {
      data: undefined,
      isLoading: false,
      isPresent: false,
      isPendingForFetch: true,
      error: null,
      errorPermanent: false,
      isStale: false,
      isReadyForRetry: false,
    })
  })

  test('respects null as valid item data', async () => {
    const { store, apiMock } = createStore({}, 'nilItem')

    store.doFetchTestResource()
    await apiMock.resolveFetchRequest('nilItem')

    assertItem(store, {
      data: null,
      isLoading: false,
      isPresent: true,
      isPendingForFetch: false,
      error: null,
      errorPermanent: false,
      isStale: false,
      isReadyForRetry: false,
    })
  })

  describe('adjust action creator', () => {
    test('replaces data when called with parameter', async () => {
      const { store, apiMock } = createStore()

      store.doFetchTestResource()
      await apiMock.resolveFetchRequest(1)

      store.doAdjustTestResource('foobar')
      assertItem(store, {
        data: 'foobar',
        isLoading: false,
        isPresent: true,
        isPendingForFetch: false,
        error: null,
        errorPermanent: false,
        isStale: false,
        isReadyForRetry: false,
      })
    })

    test('accepts updater function as a parameter', async () => {
      const { store, apiMock } = createStore()

      store.doFetchTestResource()
      await apiMock.resolveFetchRequest(1)

      store.doAdjustTestResource(value => `${value}:${value}`)
      assertItem(store, {
        data: 'One:One',
        isLoading: false,
        isPresent: true,
        isPendingForFetch: false,
        error: null,
        errorPermanent: false,
        isStale: false,
        isReadyForRetry: false,
      })
    })

    test('ignores adjustments when there is no data', async () => {
      const { store } = createStore()

      store.doAdjustTestResource('XX')
      assertItem(store, {
        data: undefined,
        isLoading: false,
        isPresent: false,
        isPendingForFetch: true,
        error: null,
        errorPermanent: false,
        isStale: false,
        isReadyForRetry: false,
      })

      store.doAdjustTestResource(() => {
        throw new Error('I should not be called')
      })
    })
  })

  describe('dependency keys', () => {
    describe('with one dependency', () => {
      test('does not try to fetch while dependencies are not satisfied', () => {
        const { store } = createStore({ dependencyKey: 'currentPage' })
        expect(store.selectTestResourceIsPendingForFetch()).toBe(false)
      })

      test('triggers pending state as soon as dependency is resolved', async () => {
        const { store } = createStore({ dependencyKey: 'currentPage' })
        store.doChangePaging({ currentPage: 1 })
        await tapReactors()
        expect(store.selectTestResourceIsPendingForFetch()).toBe(true)
      })

      test('clears the store when dependency changes', async () => {
        const { store, apiMock } = createStore({ dependencyKey: 'currentPage' })
        store.doChangePaging({ currentPage: 1 })
        await tapReactors()
        store.doFetchTestResource()
        await apiMock.resolveFetchRequest(1)

        store.doChangePaging({ currentPage: 2 })
        await tapReactors()
        assertItem(store, {
          data: undefined,
          isLoading: false,
          isPresent: false,
          isPendingForFetch: true,
          error: null,
          errorPermanent: false,
          isStale: false,
          isReadyForRetry: false,
        })
      })

      test('stales a resource instead of clearing it with "stale" option', async () => {
        const { store, apiMock } = createStore({ dependencyKey: { key: 'currentPage', staleOnChange: true } })
        store.doChangePaging({ currentPage: 1 })
        await tapReactors()
        store.doFetchTestResource()
        await apiMock.resolveFetchRequest(1)

        store.doChangePaging({ currentPage: 2 })
        await tapReactors()

        assertItem(store, {
          data: 'One',
          isLoading: false,
          isPresent: true,
          isPendingForFetch: true,
          error: null,
          errorPermanent: false,
          isStale: true,
          isReadyForRetry: false,
        })
      })

      test('allows to enable passing down blank values', async () => {
        const { store } = createStore({ dependencyKey: { key: 'currentPage', allowBlank: true } })
        await tapReactors()
        expect(store.selectTestResourceIsPendingForFetch()).toBe(true)
      })

      test.todo('mixes in dependency values into getPromise call')
    })

    describe('with multiple dependencies', () => {
      test('does not try to fetch while dependencies are not satisfied', () => {
        const { store } = createStore({ dependencyKey: ['currentPage', 'pageSize'] })
        expect(store.selectTestResourceIsPendingForFetch()).toBe(false)
      })

      test('triggers pending state as soon as dependency is resolved', async () => {
        const { store } = createStore({ dependencyKey: ['currentPage', 'pageSize'] })
        store.doChangePaging({ currentPage: 1 })
        await tapReactors()
        await tapReactors()
        expect(store.selectTestResourceIsPendingForFetch()).toBe(true)
      })

      test('clears the store when dependency changes', async () => {
        const { store, apiMock } = createStore({ dependencyKey: ['currentPage', 'pageSize'] })
        store.doChangePaging({ currentPage: 1 })
        await tapReactors()
        await tapReactors()

        store.doFetchTestResource()
        await apiMock.resolveFetchRequest(1)

        store.doChangePaging({ currentPage: 2 })
        await tapReactors()
        assertItem(store, {
          data: undefined,
          isLoading: false,
          isPresent: false,
          isPendingForFetch: true,
          error: null,
          errorPermanent: false,
          isStale: false,
          isReadyForRetry: false,
        })
      })

      test('stales a resource instead of clearing it with "stale" option and allows blank items', async () => {
        const { store } = createStore({
          dependencyKey: [{ key: 'currentPage', allowBlank: true }, { key: 'pageSize', staleOnChange: true }],
        })

        await tapReactors()
        expect(store.selectTestResourceIsPendingForFetch()).toBe(true)

        store.doChangePaging({ pageSize: 120 })
        await tapReactors()
        expect(store.selectTestResourceIsStale()).toBe(true)
      })

      test.todo('mixes in dependency values into getPromise call')
    })
  })
})

function createStore(settings = {}, itemId = 1) {
  const apiMock = new MockApiClient()

  const apiMockBundle = {
    name: 'withApiClient',
    getExtraArgs: () => ({ apiClient: apiMock }),
  }

  const asyncResourceBundle = createAsyncResourceBundle({
    name: 'testResource',
    getPromise: ({ apiClient }) => apiClient.fetchItem(itemId),
    ...settings,
  })

  const pagingBundle = {
    name: 'paging',
    reducer: (state = { currentPage: null, pageSize: 10 }, action) => {
      if (action.type === 'paging.change') {
        return {
          ...state,
          ...action.payload,
        }
      }
      return state
    },
    doChangePaging: payload => ({ type: 'paging.change', payload: payload }),
    selectCurrentPage: state => state.paging.currentPage,
    selectPageSize: state => state.paging.pageSize,
  }

  const storeFactory = composeBundlesRaw(
    createReactorBundle(),
    appTimeBundle,
    apiMockBundle,
    asyncResourceBundle,
    pagingBundle
  )

  return { store: storeFactory(), apiMock }
}

function timeTravelTo(time, store) {
  return new Promise(async (resolve, reject) => {
    try {
      timekeeper.travel(START_TIME + time)
      store.dispatch({ type: 'dummy action', payload: null }) // just tap the app time
      await tapReactors()
      resolve()
    } catch (e) {
      reject(e)
    }
  })
}

async function tapReactors() {
  const tapOneReactor = () => new Promise(resolve => setTimeout(resolve, 0))
  await tapOneReactor()
  await tapOneReactor()
  await tapOneReactor()
}

function assertItem(
  store,
  { data, isLoading, isStale, isReadyForRetry, isPresent, isPendingForFetch, error, errorPermanent }
) {
  expect(store.selectTestResource()).toStrictEqual(data)
  expect(store.selectTestResourceIsLoading()).toBe(isLoading)
  expect(store.selectTestResourceIsPresent()).toBe(isPresent)
  expect(store.selectTestResourceIsPendingForFetch()).toBe(isPendingForFetch)
  expect(store.selectTestResourceError()).toStrictEqual(error)
  expect(store.selectTestResourceErrorIsPermanent()).toBe(errorPermanent)
  expect(store.selectTestResourceIsStale()).toBe(isStale)
  expect(store.selectTestResourceIsReadyForRetry()).toBe(isReadyForRetry)
}
