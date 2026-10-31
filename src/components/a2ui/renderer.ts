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

const applyCreateSurface = (
  state: A2UIRenderState,
  message: A2UIMessage
): A2UIApplyResult => {
  if (!("createSurface" in message)) {
    return { ok: true, state };
  }
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
};

const applyUpdateComponents = (
  state: A2UIRenderState,
  message: A2UIMessage,
  input: unknown
): A2UIApplyResult => {
  if (!("updateComponents" in message)) {
    return { ok: true, state };
  }
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
};

const applyUpdateDataModel = (
  state: A2UIRenderState,
  message: A2UIMessage
): A2UIApplyResult => {
  if (!("updateDataModel" in message)) {
    return { ok: true, state };
  }
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
};

const applyDeleteSurface = (
  state: A2UIRenderState,
  message: A2UIMessage
): A2UIApplyResult => {
  if (!("deleteSurface" in message)) {
    return { ok: true, state };
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

export const applyA2UIMessage = (
  state: A2UIRenderState,
  input: unknown
): A2UIApplyResult => {
  const validation = validateA2UIMessage(input);
  if (!validation.ok) {
    return failure(state, validation.code, validation.message);
  }

  const message: A2UIMessage = validation.value;

  const afterCreate = applyCreateSurface(state, message);
  if (!afterCreate.ok) {
    return afterCreate;
  }
  const afterComponents = applyUpdateComponents(
    afterCreate.state,
    message,
    input
  );
  if (!afterComponents.ok) {
    return afterComponents;
  }
  const afterDataModel = applyUpdateDataModel(afterComponents.state, message);
  return afterDataModel.ok
    ? applyDeleteSurface(afterDataModel.state, message)
    : afterDataModel;
};
