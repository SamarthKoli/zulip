import $ from "jquery";
import {delegate} from "tippy.js";

import render_send_later_modal from "../templates/send_later_modal.hbs";
import render_send_later_popover from "../templates/send_later_popover.hbs";

import * as compose from "./compose";
import * as compose_validate from "./compose_validate";
import * as flatpickr from "./flatpickr";
import * as overlays from "./overlays";
import * as popover_menus from "./popover_menus";
import * as scheduled_messages from "./scheduled_messages";
import * as timerender from "./timerender";
import {parse_html} from "./ui_util";

let selected_send_later_timestamp;

export function get_selected_send_later_timestamp() {
    if (!selected_send_later_timestamp) {
        return undefined;
    }
    return selected_send_later_timestamp;
}

export function get_formatted_selected_send_later_time() {
    const current_time = Date.now() / 1000; // seconds, like selected_send_later_timestamp
    if (
        scheduled_messages.is_send_later_timestamp_missing_or_expired(
            selected_send_later_timestamp,
            current_time,
        )
    ) {
        return undefined;
    }
    return timerender.get_full_datetime(new Date(selected_send_later_timestamp * 1000), "time");
}

export function set_selected_schedule_timestamp(timestamp) {
    selected_send_later_timestamp = timestamp;
}

export function reset_selected_schedule_timestamp() {
    selected_send_later_timestamp = undefined;
}

function set_compose_box_schedule(element) {
    const selected_send_at_time = element.dataset.sendStamp / 1000;
    return selected_send_at_time;
}

export function open_send_later_menu() {
    if (!compose_validate.validate(true)) {
        return;
    }

    // Only show send later options that are possible today.
    const date = new Date();
    const filtered_send_opts = scheduled_messages.get_filtered_send_opts(date);
    $("body").append(render_send_later_modal(filtered_send_opts));
    let interval;

    overlays.open_modal("send_later_modal", {
        autoremove: true,
        on_show() {
            interval = setInterval(
                scheduled_messages.update_send_later_options,
                scheduled_messages.SCHEDULING_MODAL_UPDATE_INTERVAL_IN_MILLISECONDS,
            );

            const $send_later_modal = $("#send_later_modal");

            // Upon the first keydown event, we focus on the first element in the list,
            // enabling keyboard navigation that is handled by `hotkey.js` and `list_util.ts`.
            $send_later_modal.one("keydown", () => {
                const $options = $send_later_modal.find("a");
                $options[0].focus();

                $send_later_modal.on("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.target.click();
                    }
                });
            });

            $send_later_modal.on("click", ".send_later_custom", (e) => {
                const $send_later_modal_content = $send_later_modal.find(".modal__content");
                const current_time = new Date();
                flatpickr.show_flatpickr(
                    $(".send_later_custom")[0],
                    do_schedule_message,
                    new Date(current_time.getTime() + 60 * 60 * 1000),
                    {
                        minDate: new Date(
                            current_time.getTime() +
                                scheduled_messages.MINIMUM_SCHEDULED_MESSAGE_DELAY_SECONDS * 1000,
                        ),
                        onClose() {
                            // Return to normal state.
                            $send_later_modal_content.css("pointer-events", "all");
                        },
                    },
                );
                // Disable interaction with rest of the options in the modal.
                $send_later_modal_content.css("pointer-events", "none");
                e.preventDefault();
                e.stopPropagation();
            });
            $send_later_modal.one(
                "click",
                ".send_later_today, .send_later_tomorrow, .send_later_monday",
                (e) => {
                    const send_at_time = set_compose_box_schedule(e.currentTarget);
                    do_schedule_message(send_at_time);
                    e.preventDefault();
                    e.stopPropagation();
                },
            );
        },
        on_shown() {
            // When shown, we should give the modal focus to correctly handle keyboard events.
            const $send_later_modal_overlay = $("#send_later_modal .modal__overlay");
            $send_later_modal_overlay.trigger("focus");
        },
        on_hide() {
            clearInterval(interval);
        },
    });
}

export function do_schedule_message(send_at_time) {
    overlays.close_modal_if_open("send_later_modal");

    if (!Number.isInteger(send_at_time)) {
        // Convert to timestamp if this is not a timestamp.
        send_at_time = Math.floor(Date.parse(send_at_time) / 1000);
    }
    selected_send_later_timestamp = send_at_time;
    compose.finish(true);
}

export function initialize() {
    delegate("body", {
        ...popover_menus.default_popover_props,
        target: "#send_later i",
        onUntrigger() {
            // This is only called when the popover is closed by clicking on `target`.
            $("#compose-textarea").trigger("focus");
        },
        onShow(instance) {
            const formatted_send_later_time = get_formatted_selected_send_later_time();
            instance.setContent(
                parse_html(
                    render_send_later_popover({
                        formatted_send_later_time,
                    }),
                ),
            );
            popover_menus.popover_instances.send_later = instance;
            $(instance.popper).one("click", instance.hide);
        },
        onMount(instance) {
            const $popper = $(instance.popper);
            $popper.one("click", ".send_later_selected_send_later_time", () => {
                const send_at_timestamp = get_selected_send_later_timestamp();
                do_schedule_message(send_at_timestamp);
            });
            $popper.one("click", ".open_send_later_modal", open_send_later_menu);
        },
        onHidden(instance) {
            instance.destroy();
            popover_menus.popover_instances.send_later = undefined;
        },
    });
}