/**
 * Manga Translator - Overlay Manager Module
 * 
 * Handles canvas compositing for translation overlays.
 * Wraps images in containers and renders translated bubbles on one canvas.
 */

import type { BoundingBox } from './types';

type PolygonPoint = number[];

export interface BubbleRenderData {
    box: BoundingBox;
    translatedText: string;
    cleanImage?: string | null;
    clean_image?: string | null;
    polygon?: PolygonPoint[];
}

export class OverlayManager {
    private image: HTMLImageElement;
    private wrapper: HTMLDivElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private imageCache: Map<string, Promise<HTMLImageElement>> = new Map();
    private bubbleBuffer: BubbleRenderData[] = [];
    private resizeObserver: ResizeObserver | null = null;
    private naturalWidth: number;
    private naturalHeight: number;

    constructor(image: HTMLImageElement, naturalWidth: number, naturalHeight: number) {
        this.image = image;
        this.naturalWidth = naturalWidth;
        this.naturalHeight = naturalHeight;
        this.observeImageResize();
    }
    private observeImageResize(): void {
        if (typeof ResizeObserver === 'undefined') return;
        this.resizeObserver = new ResizeObserver(() => {
            this.syncCanvasSize();
            if (this.bubbleBuffer.length > 0) void this.renderBubbles(this.bubbleBuffer);
        });
        this.resizeObserver.observe(this.image);
    }

    /**
     * Ensure the image is wrapped in a relative-positioned container
     */
    private ensureWrapper(): HTMLDivElement {
        const parent = this.image.parentElement;
        if (parent?.classList.contains('manga-translator-wrapper')) {
            this.wrapper = parent as HTMLDivElement;
            return this.wrapper;
        }

        this.wrapper = document.createElement('div');
        this.wrapper.className = 'manga-translator-wrapper';
        this.wrapper.style.cssText = `
            position: relative;
            display: inline-block;
            line-height: 0;
        `;

        this.image.parentNode?.insertBefore(this.wrapper, this.image);
        this.wrapper.appendChild(this.image);

        return this.wrapper;
    }

    /**
     * Calculate scale factors for YOLO coordinates.
     * YOLO coords are based on natural image size, but display may be CSS-scaled.
     */
    private getScaleFactors(): { scaleX: number; scaleY: number } {
        const displayWidth = this.image.clientWidth || this.image.offsetWidth;
        const displayHeight = this.image.clientHeight || this.image.offsetHeight;

        return {
            scaleX: displayWidth / this.naturalWidth,
            scaleY: displayHeight / this.naturalHeight,
        };
    }

    /**
     * Ensure a single absolute-positioned canvas exists on top of the image.
     */
    private ensureCanvas(): CanvasRenderingContext2D {
        const wrapper = this.ensureWrapper();

        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'manga-translator-canvas';
            this.canvas.style.cssText = `
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
            `;

            wrapper.appendChild(this.canvas);
        }

        const ctx = this.canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to get overlay canvas 2D context');
        }

        this.ctx = ctx;
        this.syncCanvasSize();
        return ctx;
    }

    /**
     * Keep backing-canvas pixels aligned with the current image display size.
     */
    private syncCanvasSize(): void {
        if (!this.canvas || !this.ctx) return;

        const width = this.image.clientWidth || this.image.offsetWidth;
        const height = this.image.clientHeight || this.image.offsetHeight;
        const dpr = window.devicePixelRatio || 1;

        const targetWidth = Math.max(1, Math.round(width * dpr));
        const targetHeight = Math.max(1, Math.round(height * dpr));

        if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
            this.canvas.width = targetWidth;
            this.canvas.height = targetHeight;
            this.canvas.style.width = `${width}px`;
            this.canvas.style.height = `${height}px`;
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
    }

    /**
     * Build a clip path from polygon points or from the rectangular box fallback.
     */
    private applyClipPath(
        ctx: CanvasRenderingContext2D,
        bubble: BubbleRenderData,
        left: number,
        top: number,
        width: number,
        height: number,
        scaleX: number,
        scaleY: number
    ): void {
        const polygon = bubble.polygon;

        ctx.beginPath();

        if (polygon && polygon.length >= 3) {
            const [firstX, firstY] = polygon[0];
            ctx.moveTo(firstX * scaleX, firstY * scaleY);

            for (let i = 1; i < polygon.length; i += 1) {
                const [x, y] = polygon[i];
                ctx.lineTo(x * scaleX, y * scaleY);
            }

            ctx.closePath();
        } else {
            ctx.rect(left, top, width, height);
        }

        ctx.clip();
    }

    /**
     * Load and decode an image for canvas compositing.
     */
    private loadImage(src: string): Promise<HTMLImageElement> {
        const cached = this.imageCache.get(src);
        if (cached) return cached;

        const promise = new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to decode clean image for overlay drawing'));
            img.src = src;
        });

        this.imageCache.set(src, promise);
        return promise;
    }

    /**
     * Split text into wrapped lines that fit the available width.
     */
    private buildWrappedLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
        const words = text.trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) return [''];

        const lines: string[] = [];
        let current = words[0];

        for (let i = 1; i < words.length; i += 1) {
            const candidate = `${current} ${words[i]}`;
            if (ctx.measureText(candidate).width <= maxWidth) {
                current = candidate;
            } else {
                lines.push(current);
                current = words[i];
            }
        }

        lines.push(current);
        return lines;
    }

    /**
     * Draw wrapped translated text centered inside the target region.
     */
    private drawWrappedText(
        ctx: CanvasRenderingContext2D,
        translatedText: string,
        left: number,
        top: number,
        width: number,
        height: number
    ): void {
        const padding = Math.max(4, Math.round(Math.min(width, height) * 0.08));
        const innerWidth = Math.max(1, width - padding * 2);
        const innerHeight = Math.max(1, height - padding * 2);

        let fontSize = Math.max(10, Math.min(22, Math.round(height / 4)));
        let lines: string[] = [];
        let lineHeight = 0;

        while (fontSize >= 8) {
            ctx.font = `${fontSize}px sans-serif`;
            lines = this.buildWrappedLines(ctx, translatedText, innerWidth);
            lineHeight = Math.round(fontSize * 1.25);

            if (lines.length * lineHeight <= innerHeight) {
                break;
            }

            fontSize -= 1;
        }

        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = '#111';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const blockHeight = lines.length * lineHeight;
        const startY = top + padding + Math.max(0, (innerHeight - blockHeight) / 2);
        const centerX = left + width / 2;

        for (let i = 0; i < lines.length; i += 1) {
            const y = startY + i * lineHeight;
            if (y > top + height - padding) break;
            ctx.fillText(lines[i], centerX, y);
        }
    }

    /**
     * Draw one bubble onto the overlay canvas.
     */
    private async drawBubble(
        ctx: CanvasRenderingContext2D,
        bubble: BubbleRenderData,
        scaleX: number,
        scaleY: number
    ): Promise<void> {
        const left = bubble.box.x1 * scaleX;
        const top = bubble.box.y1 * scaleY;
        const width = (bubble.box.x2 - bubble.box.x1) * scaleX;
        const height = (bubble.box.y2 - bubble.box.y1) * scaleY;

        const cleanImage = bubble.cleanImage ?? bubble.clean_image;

        ctx.save();
        this.applyClipPath(ctx, bubble, left, top, width, height, scaleX, scaleY);

        if (cleanImage) {
            try {
                const cleanImageElement = await this.loadImage(cleanImage);
                ctx.drawImage(cleanImageElement, left, top, width, height);
            } catch (error) {
                console.warn('[MangaTranslator] Falling back to white fill after clean image decode failure:', error);
                ctx.fillStyle = '#fff';
                ctx.fillRect(left, top, width, height);
            }
        } else {
            ctx.fillStyle = '#fff';
            ctx.fillRect(left, top, width, height);
        }

        this.drawWrappedText(ctx, bubble.translatedText, left, top, width, height);
        ctx.restore();
    }

    /**
     * Render all bubbles in a single canvas compositing pass.
     */
    async renderBubbles(bubbles: BubbleRenderData[]): Promise<void> {
        this.bubbleBuffer = [...bubbles];

        if (bubbles.length === 0) {
            this.clearBubbles();
            return;
        }

        const ctx = this.ensureCanvas();
        const { scaleX, scaleY } = this.getScaleFactors();

        ctx.clearRect(0, 0, this.image.clientWidth || this.image.offsetWidth, this.image.clientHeight || this.image.offsetHeight);

        for (const bubble of bubbles) {
            await this.drawBubble(ctx, bubble, scaleX, scaleY);
        }
    }

    /**
     * Create a translation bubble at the specified bounding box.
     * Draws one translated bubble using the existing canvas compositor.
     */
    async createBubble(
        box: BoundingBox,
        translatedText: string,
        cleanImage?: string | null,
        polygon?: PolygonPoint[]
    ): Promise<void> {
        this.bubbleBuffer.push({ box, translatedText, cleanImage, polygon });
        await this.renderBubbles(this.bubbleBuffer);
    }

    /**
     * Create a loading placeholder bubble
     */
    async createLoadingBubble(box: BoundingBox): Promise<void> {
        this.bubbleBuffer.push({ box, translatedText: '...' });
        await this.renderBubbles(this.bubbleBuffer);
    }

    /**
     * Remove all translation bubbles from this image
     */
    clearBubbles(): void {
        this.bubbleBuffer = [];

        if (this.canvas && this.ctx) {
            this.ctx.clearRect(0, 0, this.image.clientWidth || this.image.offsetWidth, this.image.clientHeight || this.image.offsetHeight);
            return;
        }

        if (this.wrapper) {
            const legacyBubbles = this.wrapper.querySelectorAll('.manga-translator-bubble');
            legacyBubbles.forEach((bubble) => bubble.remove());
        }
    }
}
