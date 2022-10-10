import type {
  App,
} from 'vue'
import {
  inject, nextTick,
  onBeforeUnmount,
  watchEffect,
} from 'vue'
import type { MergeHead } from '@zhead/schema'
import {
  PROVIDE_KEY,
} from './constants'
import { resolveUnrefHeadInput } from './utils'
import type {
  HeadEntry,
  HeadEntryOptions, HeadObjectApi,
  HookBeforeDomUpdate, HookTagsResolved,
  ResolvedUseHeadInput, UseHeadInput, UseHeadRawInput,
} from './types'
import { updateDOM } from './dom/update-dom'

export * from './types'

export interface HeadClient<T extends MergeHead = {}> {
  install: (app: App) => void

  headEntries: HeadEntry<T>[]

  addEntry: (entry: UseHeadInput<T>, options?: HeadEntryOptions) => HeadObjectApi<T>
  addReactiveEntry: (objs: UseHeadInput<T>, options?: HeadEntryOptions) => () => void

  updateDOM: (document?: Document, force?: boolean) => void

  /**
   * Array of user provided functions to hook into before the DOM is updated.
   *
   * When returning false from this function, it will block DOM updates, this can be useful when stopping dom updates
   * between page transitions.
   *
   * You are able to modify the payload of hook using this.
   */
  hookBeforeDomUpdate: HookBeforeDomUpdate
  /**
   * Array of user provided functions to hook into after the tags have been resolved (deduped and sorted).
   */
  hookTagsResolved: HookTagsResolved
}

export const IS_BROWSER = typeof window !== 'undefined'

/**
 * Inject the head manager instance
 * Exported for advanced usage or library integration, you probably don't need this
 */
export const injectHead = <T extends MergeHead = {}>() => {
  const head = inject<HeadClient<T>>(PROVIDE_KEY)

  if (!head)
    throw new Error('You may forget to apply app.use(head)')

  return head
}

export const createHead = <T extends MergeHead = {}>(initHeadObject?: ResolvedUseHeadInput<T>) => {
  let entries: HeadEntry<T>[] = []
  // counter for keeping unique ids of head object entries
  let entryId = 0

  const previousTags = new Set<string>()

  const hookBeforeDomUpdate: HookBeforeDomUpdate = []
  const hookTagsResolved: HookTagsResolved = []

  let domUpdateTick: Promise<void> | null = null

  const head: HeadClient<T> = {
    install(app) {
      app.config.globalProperties.$head = head
      app.provide(PROVIDE_KEY, head)
    },

    hookBeforeDomUpdate,
    hookTagsResolved,

    get headEntries() {
      return entries
    },

    addEntry(input, options = {}) {
      let resolved = false
      if (options?.resolved) {
        resolved = true
        delete options.resolved
      }
      const entry: any = {
        id: entryId++,
        options,
        resolved,
        input,
      }
      entries.push(entry as HeadEntry<T>)
      return {
        remove() {
          entries = entries.filter(_objs => _objs.id !== entry.id)
        },
        update(updatedInput: ResolvedUseHeadInput<T>) {
          entries = entries.map((e) => {
            if (e.id === entry.id)
              e.input = updatedInput
            return e
          })
        },
      }
    },

    async updateDOM(document?: Document, force?: boolean) {
      // within the debounced dom update we need to compute all the tags so that watchEffects still works
      const doDomUpdate = () => {
        domUpdateTick = null
        return updateDOM({ head, document, previousTags })
      }

      if (force)
        return doDomUpdate()

      return domUpdateTick = domUpdateTick || new Promise(resolve => nextTick(() => resolve(doDomUpdate())))
    },

    // browser only
    addReactiveEntry(input: UseHeadInput<T>, options = {}) {
      let entrySideEffect: HeadObjectApi<T> | null = null
      const cleanUpWatch = watchEffect(() => {
        const resolvedInput = resolveUnrefHeadInput(input)
        if (entrySideEffect === null) {
          entrySideEffect = head.addEntry(
            resolvedInput,
            { ...options, resolved: true },
          )
        }
        else {
          entrySideEffect.update(resolvedInput)
        }
        if (IS_BROWSER)
          head.updateDOM()
      })
      return () => {
        cleanUpWatch()
        if (entrySideEffect)
          entrySideEffect.remove()
      }
    },
  }

  if (initHeadObject)
    head.addEntry(initHeadObject)

  return head
}

const _useHead = <T extends MergeHead = {}>(headObj: UseHeadInput<T>, options: HeadEntryOptions = {}) => {
  const head = injectHead()

  if (!IS_BROWSER) {
    head.addEntry(headObj, options)
  }
  else {
    const cleanUp = head.addReactiveEntry(headObj, options)
    onBeforeUnmount(() => {
      cleanUp()
      head.updateDOM()
    })
  }
}
export const useHead = <T extends MergeHead = {}>(headObj: UseHeadInput<T>) => {
  _useHead(headObj)
}

export const useHeadRaw = (headObj: UseHeadRawInput) => {
  _useHead(headObj, { raw: true })
}

export * from './components'
export * from './dom'
export * from './ssr'
export * from './utils'
