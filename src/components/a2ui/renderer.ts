import {
  a2uiCatalogVersionForId,
  validateA2UIMessage,
} from "@/shared/a2ui-contract";
import type {
  A2UIComponent,
  A2UICatalogVersion,
  A2UIDataModel,
  A2UIMessage,
} from "@/shared/a2ui-contract";

export interface A2UIRenderSurface {
  catalogId: string;
  catalogVersion: A2UICatalogVersion;
  components: Partial<Record<string, A2UIComponent>>;
  dataModel?: A2UIDataModel;
}

export interface A2UIRenderState {
  surfaces: Partial<Record<string, A2UIRenderSurface>>;
}

export type A2UIApplyResult =
  | { ok: true; state: A2UIRenderState }
  | { ok: false; state: A2UIRenderState; code: string; message: string };

export const createA2UIRenderState = (): A2UIRenderState => ({ surfaces: {} });

const failure = (
  state: A2UIRenderState,
  code: string,
  message: string
): A2UIApplyResult => ({ ok: false, state, code, message });

export const applyA2UIMessage = (
  state: A2UIRenderState,
  input: unknown
): A2UIApplyResult => {
  const validation = validateA2UIMessage(input);
  if (!validation.ok) {
    return failure(state, validation.code, validation.message);
  }

  const message: A2UIMessage = validation.value;

  if ("createSurface" in message) {
    const { surfaceId, catalogId } = message.createSurface;
    const catalogVersion = a2uiCatalogVersionForId(catalogId);
    if (!catalogVersion) {
      return failure(
        state,
        "UNSUPPORTED_CATALOG",
        "This preview catalog version is not supported."
      );
    }

    const existing = state.surfaces[surfaceId];
    if (existing && existing.catalogId !== catalogId) {
      return failure(
        state,
        "SURFACE_CATALOG_CONFLICT",
        "The preview surface changed catalogs and was stopped safely."
      );
    }

    if (existing) {
      return { ok: true, state };
    }

    return {
      ok: true,
      state: {
        surfaces: {
          ...state.surfaces,
          [surfaceId]: {
            catalogId,
            catalogVersion,
            components: {},
          },
        },
      },
    };
  }

  if ("updateComponents" in message) {
    const { surfaceId } = message.updateComponents;
    const surface = state.surfaces[surfaceId];
    if (!surface) {
      return failure(
        state,
        "SURFACE_NOT_FOUND",
        "The preview sent content for a surface that was not created."
      );
    }

    // #116: the surface's pinned catalog scopes components and actions; a
    // foreign component fails closed even though another catalog knows it.
    const scoped = validateA2UIMessage(input, {
      catalogVersion: surface.catalogVersion,
    });
    if (!scoped.ok || !("updateComponents" in scoped.value)) {
      return failure(
        state,
        scoped.ok ? "INVALID_MESSAGE" : scoped.code,
        scoped.ok ? "The preview components were rejected." : scoped.message
      );
    }

    const nextComponents = { ...surface.components };
    for (const component of scoped.value.updateComponents.components) {
      nextComponents[component.id] = component;
    }

    return {
      ok: true,
      state: {
        surfaces: {
          ...state.surfaces,
          [surfaceId]: { ...surface, components: nextComponents },
        },
      },
    };
  }

  if ("updateDataModel" in message) {
    const { surfaceId, value } = message.updateDataModel;
    const surface = state.surfaces[surfaceId];
    if (!surface) {
      return failure(
        state,
        "SURFACE_NOT_FOUND",
        "The preview sent data for a surface that was not created."
      );
    }

    return {
      ok: true,
      state: {
        surfaces: {
          ...state.surfaces,
          [surfaceId]: { ...surface, dataModel: value },
        },
      },
    };
  }

  const { surfaceId } = message.deleteSurface;
  if (!Object.hasOwn(state.surfaces, surfaceId)) {
    return { ok: true, state };
  }

  const nextSurfaces = Object.fromEntries(
    Object.entries(state.surfaces).filter(([key]) => key !== surfaceId)
  );
  return { ok: true, state: { surfaces: nextSurfaces } };
};
