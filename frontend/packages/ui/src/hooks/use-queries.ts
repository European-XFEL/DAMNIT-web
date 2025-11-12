/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `useQueries` is a hook that supports multiple RTK queries at once and returns the batched results.
 * This is not available as built-in yet, and is lifted from the following discussion:
 * @see {@link https://github.com/reduxjs/redux-toolkit/discussions/1171#discussioncomment-10075198}
 */

import {
  type TypedQueryStateSelector,
  type TypedUseQueryStateOptions,
} from '@reduxjs/toolkit/query/react'
import { useEffect, useMemo, useReducer, useRef } from 'react'

import { useAppDispatch } from '../redux/hooks'

type State<Data, Argument> = {
  isUninitialized: boolean
  isLoading: boolean
  isFetching: boolean
  isSuccess: boolean
  isError: boolean
  originalArgs: Argument[]
  data: Data[] | undefined
  currentData: Data[] | undefined
  error: Data[] | undefined
}

const loadingReducer = <Data, Argument>(
  _state: State<Data, Argument> | undefined,
  originalArgs: Argument[]
) => {
  return {
    isUninitialized: false,
    isLoading: true,
    isFetching: true,
    isSuccess: false,
    isError: false,
    originalArgs: originalArgs,
    data: undefined,
    currentData: undefined,
    error: undefined,
  }
}

const fetchingReducer = <Data, Argument>(
  state: State<Data, Argument>,
  originalArgs: Argument[]
) => {
  return {
    isUninitialized: false,
    isLoading: state.data === undefined,
    isFetching: true,
    isSuccess: state.data !== undefined,
    isError: false,
    originalArgs: originalArgs,
    data: state.data,
    currentData: undefined,
    error: undefined,
  }
}

const successReducer = <Data, Argument>(
  state: State<Data, Argument>,
  data: Data[],
  selectFromResult?: TypedQueryStateSelector<any, any, any>
) => {
  const result = {
    isUninitialized: false,
    isLoading: false,
    isFetching: false,
    isSuccess: true,
    isError: false,
    originalArgs: state.originalArgs,
    data,
    currentData: data,
    error: undefined,
  } as any // CC: Not recommended, though we keep as close as original implementation
  return selectFromResult ? selectFromResult(result) : result
}

const errorReducer = <Data, Argument>(
  state: State<Data, Argument>,
  error: Data[]
) => {
  return {
    isUninitialized: false,
    isLoading: false,
    isFetching: false,
    isSuccess: false,
    isError: true,
    originalArgs: state.originalArgs,
    data: state.data,
    currentData: undefined,
    error,
  }
}

type UseQueryResultReturn<Data, Argument> = [
  State<Data, Argument>,
  {
    success(
      data: Data[],
      selectFromResult?: TypedQueryStateSelector<any, any, any>
    ): void
    fetching(originalArgs: Argument[]): void
    loading(originalArgs: Argument[]): void
    error(error: Data[]): void
  },
]

const useQueryResult = <Data, Argument>(
  originalArgs: Argument[]
): UseQueryResultReturn<Data, Argument> => {
  const [state, setState] = useReducer(
    (state: State<Data, Argument>, [reducer, value, fn]: any) =>
      reducer(state, value, fn),
    undefined,
    () => loadingReducer(undefined, originalArgs)
  )

  const setStateWrapper = useMemo(
    () => ({
      loading(originalArgs: Argument[]) {
        setState([loadingReducer, originalArgs])
      },
      fetching(originalArgs: Argument[]) {
        setState([fetchingReducer, originalArgs])
      },
      success(
        data: Data[],
        selectFromResult?: TypedQueryStateSelector<any, any, any>
      ) {
        setState([successReducer, data, selectFromResult])
      },
      error(error: Data[]) {
        setState([errorReducer, error])
      },
    }),
    []
  )

  return [state, setStateWrapper]
}

const useQueries = <Endpoint, Data, Argument>(
  endpoint: Endpoint,
  originalArgs: Argument[] = [],
  options: TypedUseQueryStateOptions<any, any, any> = {}
) => {
  const endpointRef = useRef<Endpoint>()
  const dispatch = useAppDispatch()
  const [queryResult, setQueryResult] = useQueryResult<Data, Argument>(
    originalArgs
  )

  useEffect(() => {
    if (options.skip) return
    let active = true
    const actions = originalArgs.map(
      (originalArg) => (endpoint as any).initiate(originalArg) // cast endpoint to any
    )
    const results = actions.map((action) => dispatch(action))
    const unwrappedResults = results.map((result) => result.unwrap())

    if (endpointRef.current !== endpoint) {
      endpointRef.current = endpoint
      setQueryResult.loading(originalArgs)
    } else {
      setQueryResult.fetching(originalArgs)
    }

    Promise.all(unwrappedResults)
      .then((responses) => {
        if (active) {
          setQueryResult.success(responses, options.selectFromResult)
        }
      })
      .catch((errResponse) => {
        if (active) {
          setQueryResult.error(errResponse)
        }
      })

    return () => {
      active = false
      results.forEach((result) => {
        result.unsubscribe()
      })
    }
  }, [
    endpoint,
    originalArgs,
    dispatch,
    setQueryResult,
    options.skip,
    options.selectFromResult,
  ])

  return queryResult
}

export default useQueries
