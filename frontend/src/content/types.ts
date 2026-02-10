/**
 * Manga Translator - Content Script Types
 * 
 * Shared interfaces and types for the content script modules.
 */

// Bounding box coordinates for detected speech bubbles
export interface BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

// Translation result from the backend
export interface TranslationResponse {
    translated: string;
    original?: string;
    should_render: boolean;
    clean_image?: string | null;
}

// User settings stored in Chrome storage
export interface Settings {
    enabled: boolean;
    targetLang: string;
    backendUrl: string;
}

// Response from FETCH_IMAGE_BLOB message
export interface FetchImageResponse {
    success: boolean;
    dataUrl?: string;
    size?: number;
    mimeType?: string;
    error?: string;
}

// Response from PROXY_API_REQUEST message
export interface ProxyApiResponse {
    success: boolean;
    status?: number;  // HTTP status code for error handling
    data?: unknown;
    error?: string;
}

// Detection API response format
export interface DetectionApiResponse {
    detections: Array<{
        label: string;
        conf: number;
        box: number[];
    }>;
    count: number;
}

// Image processing status
export type TranslationStatus = 'pending' | 'processing' | 'completed' | 'error';

// Processed bubble data with translation
export interface ProcessedBubble {
    box: BoundingBox;
    translatedText: string;
    shouldRender: boolean;
    cleanImage?: string | null;
}
