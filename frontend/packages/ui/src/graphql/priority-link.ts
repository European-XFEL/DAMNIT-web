import {
  ApolloLink,
  Observable,
  type FetchResult,
  type NextLink,
  type Observer,
  type Operation,
} from '@apollo/client'
import { getMainDefinition } from '@apollo/client/utilities'

type PendingOperation = {
  execute: () => Observable<FetchResult>
  observer: Observer<FetchResult>
  subscription?: { unsubscribe: () => void }
}

type CreatePriorityLinkOptions = {
  // How many queued operations may run at once.
  maxActive?: number
  // Operation names that wait their turn behind the active limit. Everything
  // else passes straight through; the caller decides which operations are
  // heavy enough to throttle.
  queuedOperations?: string[]
}

export const createPriorityLink = ({
  maxActive = 3,
  queuedOperations = [],
}: CreatePriorityLinkOptions = {}) => {
  const pendingOperations: PendingOperation[] = []
  const activeOperations: Set<PendingOperation> = new Set()

  const processNextOperation = () => {
    while (activeOperations.size < maxActive && pendingOperations.length > 0) {
      const nextOperation = pendingOperations.shift()
      if (!nextOperation) {
        break
      }

      activeOperations.add(nextOperation)
      nextOperation.subscription = nextOperation.execute().subscribe({
        next: (response) => {
          activeOperations.delete(nextOperation)
          nextOperation.observer.next?.(response)
          processNextOperation()
        },
        error: (error) => {
          activeOperations.delete(nextOperation)
          nextOperation.observer.error?.(error)
          processNextOperation()
        },
        complete: () => {
          activeOperations.delete(nextOperation)
          nextOperation.observer.complete?.()
        },
      })
    }
  }

  return new ApolloLink((operation: Operation, forward: NextLink) => {
    const definition = getMainDefinition(operation.query)
    const operationName =
      operation.operationName ||
      (definition.kind === 'OperationDefinition' && definition.name?.value) ||
      ''

    return new Observable((observer) => {
      if (!queuedOperations.includes(operationName)) {
        const subscription = forward(operation).subscribe({
          next: (response) => {
            observer.next(response)
          },
          error: (error) => {
            observer.error(error)
          },
          complete: () => {
            observer.complete()
          },
        })
        return () => subscription.unsubscribe()
      }

      const pending: PendingOperation = {
        execute: () => forward(operation) as Observable<FetchResult>,
        observer,
      }
      pendingOperations.push(pending)
      processNextOperation()

      // Nobody is waiting for this any more: the page that asked for it has
      // scrolled away, or the proposal it belongs to has been left. Without
      // this the request runs to completion regardless, and everything queued
      // behind it waits out an answer with no reader.
      return () => {
        const queuedAt = pendingOperations.indexOf(pending)
        if (queuedAt !== -1) {
          pendingOperations.splice(queuedAt, 1)
          return
        }

        const wasActive = activeOperations.delete(pending)
        pending.subscription?.unsubscribe()
        if (wasActive) {
          processNextOperation()
        }
      }
    })
  })
}
