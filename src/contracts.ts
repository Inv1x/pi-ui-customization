/** Shared event names and payloads for extensions that integrate with this footer. */
export const STATUS_OPTIONS_EVENT = "pi-ui-customization:status-options";
export const STATUS_ACTIVATION_EVENT = "pi-ui-customization:activate-status";

/** Configure how a status row is rendered while selected. */
export interface StatusOptionsEvent {
	key: string;
	preserveSelectedColors: boolean;
}

/** Request that the owning extension open the inspector for a status row. */
export interface StatusActivationEvent {
	key: string;
	sessionId: string;
}

/** Event map consumers can use to type wrappers around Pi's shared event bus. */
export interface UiCustomizationEventMap {
	[STATUS_OPTIONS_EVENT]: StatusOptionsEvent;
	[STATUS_ACTIVATION_EVENT]: StatusActivationEvent;
}
