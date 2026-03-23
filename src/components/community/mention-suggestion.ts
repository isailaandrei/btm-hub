import type { SuggestionOptions } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { MentionList, type MentionItem, type MentionListRef } from "./MentionList";

export const mentionSuggestion: Omit<SuggestionOptions<MentionItem>, "editor"> = {
  char: "@",
  allowSpaces: false,

  items: async ({ query }) => {
    if (!query) return [];

    try {
      const res = await fetch(
        `/api/community/mention-search?q=${encodeURIComponent(query)}`,
      );
      if (!res.ok) return [];
      return (await res.json()) as MentionItem[];
    } catch {
      return [];
    }
  },

  render: () => {
    let component: ReactRenderer<MentionListRef> | null = null;
    let popup: TippyInstance[] | null = null;

    return {
      onStart: (props) => {
        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) return;

        popup = tippy("body", {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
        });
      },

      onUpdate(props) {
        component?.updateProps(props);

        if (popup?.[0] && props.clientRect) {
          popup[0].setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          });
        }
      },

      onKeyDown(props) {
        if (props.event.key === "Escape") {
          popup?.[0]?.hide();
          return true;
        }
        return component?.ref?.onKeyDown(props) ?? false;
      },

      onExit() {
        popup?.[0]?.destroy();
        component?.destroy();
      },
    };
  },
};
