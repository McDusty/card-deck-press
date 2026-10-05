export interface BaseEvent {
    type: string;
    data: any;
    pageId?: string | null;
    session?: number;
    epoch?: number;
    changes?: { outputChanged: boolean; sourceChanged: boolean; metadataOnly: boolean };
    rowIds?: string[];
    requestId?: string;
}


export interface DeckEvent extends BaseEvent {
    name: string;
    size: string;
    orientation: string;
}

export interface CardField {
    id: string;
    name: string;
    type: string;
}


export type PluginUIEvent = BaseEvent | DeckEvent;
