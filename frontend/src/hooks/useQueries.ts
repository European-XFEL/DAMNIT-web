/**
 * `useQueries` is a hook that supports multiple RTK queries at once and returns the batched results.
 * This is not available as built-in yet, and is lifted from the following discussion:
 * @see {@link https://github.com/reduxjs/redux-toolkit/discussions/1171#discussioncomment-5608966}
 */

import { useEffect, useMemo, useReducer, useRef } from "react"
import { useDispatch } from "react-redux"

function loadingReducer(_state, originalArgs) {
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

function fetchingReducer(state, originalArgs) {
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

function successReducer(state, data) {
  return {
    isUninitialized: false,
    isLoading: false,
    isFetching: false,
    isSuccess: true,
    isError: false,
    originalArgs: state.originalArgs,
    data,
    currentData: data,
    error: undefined,
  }
}

function errorReducer(state, error) {
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

function useQueryResult(originalArgs) {
  const [state, setState] = useReducer(
    (state, [reducer, value]) => reducer(state, value),
    undefined,
    () => loadingReducer(undefined, originalArgs),
  )

  const setStateWrapper = useMemo(
    () => ({
      loading(originalArgs) {
        setState([loadingReducer, originalArgs])
      },
      fetching(originalArgs) {
        setState([fetchingReducer, originalArgs])
      },
      success(data) {
        setState([successReducer, data])
      },
      error(error) {
        setState([errorReducer, error])
      },
    }),
    [],
  )

  return [state, setStateWrapper]
}

export default function useQueries(endpoint, originalArgs = [undefined]) {
  const endpointRef = useRef()
  const dispatch = useDispatch()
  const [queryResult, setQueryResult] = useQueryResult(originalArgs)

  useEffect(() => {
    let active = true
    const actions = originalArgs.map((originalArg) =>
      endpoint.initiate(originalArg),
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
          setQueryResult.success(responses)
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
  }, [endpoint, originalArgs, dispatch, setQueryResult])

  return queryResult
}
