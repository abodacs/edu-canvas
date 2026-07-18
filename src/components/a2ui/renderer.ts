import { validateA2UIMessage } from '@/shared/a2ui-contract'
import type {
  A2UIComponent,
  A2UIMessage,
  A2UIPreviewDataModel,
} from '@/shared/a2ui-contract'

export interface A2UIRenderSurface {
  catalogId: string
  components: Partial<Record<string, A2UIComponent>>
  dataModel?: A2UIPreviewDataModel
}

export interface A2UIRenderState {
  surfaces: Partial<Record<string, A2UIRenderSurface>>
}

export type A2UIApplyResult =
  | { ok: true; state: A2UIRenderState }
  | { ok: false; state: A2UIRenderState; code: string; message: string }

export function createA2UIRenderState(): A2UIRenderState {
  return { surfaces: {} }
}

function failure(
  state: A2UIRenderState,
  code: string,
  message: string,
): A2UIApplyResult {
  return { ok: false, state, code, message }
}

export function applyA2UIMessage(
  state: A2UIRenderState,
  input: unknown,
): A2UIApplyResult {
  const validation = validateA2UIMessage(input)
  if (!validation.ok) {
    return failure(state, validation.code, validation.message)
  }

  const message: A2UIMessage = validation.value

  if ('createSurface' in message) {
    const { surfaceId, catalogId } = message.createSurface
    const existing = state.surfaces[surfaceId]
    if (existing && existing.catalogId !== catalogId) {
      return failure(
        state,
        'SURFACE_CATALOG_CONFLICT',
        'The preview surface changed catalogs and was stopped safely.',
      )
    }

    if (existing) return { ok: true, state }

    return {
      ok: true,
      state: {
        surfaces: {
          ...state.surfaces,
          [surfaceId]: {
            catalogId,
            components: {},
          },
        },
      },
    }
  }

  if ('updateComponents' in message) {
    const { surfaceId, components } = message.updateComponents
    const surface = state.surfaces[surfaceId]
    if (!surface) {
      return failure(
        state,
        'SURFACE_NOT_FOUND',
        'The preview sent content for a surface that was not created.',
      )
    }

    const nextComponents = { ...surface.components }
    for (const component of components) {
      nextComponents[component.id] = component
    }

    return {
      ok: true,
      state: {
        surfaces: {
          ...state.surfaces,
          [surfaceId]: { ...surface, components: nextComponents },
        },
      },
    }
  }

  if ('updateDataModel' in message) {
    const { surfaceId, value } = message.updateDataModel
    const surface = state.surfaces[surfaceId]
    if (!surface) {
      return failure(
        state,
        'SURFACE_NOT_FOUND',
        'The preview sent data for a surface that was not created.',
      )
    }

    return {
      ok: true,
      state: {
        surfaces: {
          ...state.surfaces,
          [surfaceId]: { ...surface, dataModel: value },
        },
      },
    }
  }

  const { surfaceId } = message.deleteSurface
  if (!state.surfaces[surfaceId]) return { ok: true, state }

  const nextSurfaces = { ...state.surfaces }
  delete nextSurfaces[surfaceId]
  return { ok: true, state: { surfaces: nextSurfaces } }
}
