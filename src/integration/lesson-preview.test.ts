import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { compileLessonPreview } from "@/server/a2ui/compiler";
import { createGenerationService } from "@/server/generation/service";
import { createDeterministicLessonDraftProvider } from "@/server/generation/provider";
import { createSeededPersistence } from "@/server/persistence/seeded";
import { getDemoSession } from "@/server/demo/policy";

import { A2UIComponentRenderer } from "@/components/a2ui/component-renderer";
import {
  applyA2UIMessage,
  createA2UIRenderState,
} from "@/components/a2ui/renderer";

describe("compiled lesson preview", () => {
  it.each(["en", "ar"] as const)(
    "renders the compiled %s lesson with its path, controls and selected source",
    async (language) => {
      const input = {
        prompt: "equivalent fractions for grade 4",
        grade: 4,
        standardId: "standard_ccss_4_nf_a_01",
        language,
        difficulty: "on-level" as const,
      };
      const result = await createGenerationService({
        persistence: createSeededPersistence(),
        provider: createDeterministicLessonDraftProvider(),
      }).generate({ session: getDemoSession("teacher"), input });
      if (!result.record.draft) {
        throw new Error("Expected the generated fixture to be reviewable.");
      }
      const preview = compileLessonPreview({
        ...input,
        requestId: result.record.requestId,
        draft: result.record.draft,
        learningPath: result.record.draft.learningPath,
      });
      let state = createA2UIRenderState();
      for (const message of preview.messages) {
        const applied = applyA2UIMessage(state, message);
        if (!applied.ok) {
          throw new Error(applied.message);
        }
        ({ state } = applied);
      }
      for (const [surfaceId, surface] of Object.entries(state.surfaces)) {
        if (!surface) {
          throw new Error("Expected a compiled surface.");
        }
        const variant = result.record.draft.variants.find(
          (entry) => entry.id === surface.dataModel?.variantId
        );
        if (!variant) {
          throw new Error("Expected a generated variant for the surface.");
        }
        const markup = renderToStaticMarkup(
          createElement(A2UIComponentRenderer, {
            surface,
            surfaceId,
            componentId: "root",
            selection: { source: variant.sourceItems[0].id },
            onAction: vi.fn<() => void>(),
          })
        );

        expect(markup).toContain(
          language === "ar" ? "مسار التعلم" : "Learning path"
        );
        expect(markup).toContain(
          'class="a2ui-match-card a2ui-match-card--source is-selected"'
        );
        expect(markup).toContain("a2ui-action");
        expect(markup).not.toContain("targetId");
        expect(markup).toContain('aria-pressed="true"');
      }
    }
  );
});
