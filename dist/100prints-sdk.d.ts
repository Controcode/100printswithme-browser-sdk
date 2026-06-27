export declare type AppStep = 'landing' | 'setup' | 'editor' | 'finalize' | 'feedback';

export declare class BrowserSDK {
    private apiClient;
    private templateCache;
    private fontLoader;
    constructor(options: BrowserSDKOptions);
    private fetchTemplateData;
    private getTemplateFromResponse;
    render(options: RenderOptions): Promise<RenderResult>;
    renderBulk(options: BulkRenderOptions): Promise<BulkRenderResult>;
    preview(options: PreviewOptions): Promise<HTMLCanvasElement>;
    destroy(): void;
}

export declare interface BrowserSDKOptions {
    key: string;
    baseUrl?: string;
}

export declare interface BulkData {
    headers: string[];
    columnMetadata?: Record<string, ColumnType>;
    rows: Record<string, string>[];
    fileName: string;
    _source: 'cloud' | 'local';
}

export declare interface BulkRenderOptions {
    templateId: string;
    rows: Record<string, any>[];
    format?: 'pdf' | 'png';
    quality?: 'draft' | 'standard' | 'high' | 'ultra';
    mode?: 'merged' | 'zip';
    onProgress?: (current: number, total: number, recordName: string) => void;
}

export declare interface BulkRenderResult {
    blob: Blob;
    filename: string;
    sizeKB: number;
}

export declare interface ChartData {
    subtype: ChartSubtype;
    title?: string;
    categories: string[];
    series: ChartDataSeries[];
    percentage?: string;
    colors: string[];
    showLabels: boolean;
    showLegend: boolean;
    showGrid: boolean;
    showValues: boolean;
    barWidth?: number;
    barGap?: number;
    barRadius?: number;
    lineWidth?: number;
    lineSmooth?: boolean;
    showDots?: boolean;
    dotRadius?: number;
    donutWidth?: number;
    startAngle?: number;
    trackColor?: string;
    fillColor?: string;
    strokeWidth?: number;
    roundedEnds?: boolean;
    showPercentageLabel?: boolean;
    fontSize?: number;
    fontFamily?: string;
    labelColor?: string;
    axisColor?: string;
    gridColor?: string;
}

export declare interface ChartDataSeries {
    label: string;
    values: string[];
    color: string;
}

export declare type ChartSubtype = 'bar' | 'row' | 'categorical-bar' | 'categorical-row' | 'grouped-bar' | 'grouped-row' | 'stacked-bar' | 'stacked-row' | 'stacked-proportional' | 'line' | 'multi-line' | 'pie' | 'donut' | 'progress-ring' | 'radial-progress' | 'progress-bar' | 'progress-dial';

export declare type ColumnType = 'text' | 'image' | 'qr' | 'date';

export declare type DocType = 'id-card' | 'certificate';

export declare interface DocumentTemplate {
    id: string;
    name: string;
    description?: string;
    type: String;
    category?: string;
    backgroundColor: string;
    accentColor: string;
    frontLayers: Layer[];
    backLayers?: Layer[];
    groups?: LayerGroup[];
    showCropMarks?: boolean;
    dimensions: {
        width: number;
        height: number;
        label: string;
    };
    integration_type?: string;
    data_source_id?: string | null;
    template_data?: any;
    sample_data?: {
        fileName?: string;
        headers?: string[];
        rows?: any[];
    };
    docType?: DocType;
    author?: string;
    createdAt?: string | any;
    downloads?: number;
    isCommunity?: boolean;
}

export declare interface EditorState {
    currentTemplate: DocumentTemplate;
    selectedLayerId: string | null;
    activeSide: 'front' | 'back';
    zoom: number;
}

export declare interface Layer {
    id: string;
    type: LayerType;
    x: number;
    y: number;
    width?: number;
    height?: number;
    content?: string;
    fontSize?: number;
    fontWeight?: string | number;
    fontStyle?: 'normal' | 'italic';
    textDecoration?: 'none' | 'underline' | 'dashed' | 'dotted';
    color?: string;
    fontFamily?: string;
    fontUrl?: string | null;
    textAlign?: 'left' | 'center' | 'right';
    backgroundColor?: string;
    barcodeValue?: string;
    padding?: number;
    barcodeFormat?: 'CODE128' | 'EAN13' | 'UPC' | 'QR';
    fillType?: 'solid' | 'linear' | 'radial';
    gradientColors?: string[];
    gradientAngle?: number;
    gradient?: any;
    pathOffset?: number;
    pathType?: string;
    curvature?: number;
    rotation?: number;
    opacity?: number;
    borderRadius?: number;
    locked?: boolean;
    visible?: boolean;
    borderWidth?: number;
    borderColor?: string;
    letterSpacing?: number;
    lineHeight?: number;
    shadowBlur?: number;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
    shadowColor?: string;
    logic?: SmartLogicConfig;
    tableData?: TableData;
    chartData?: ChartData;
    groupId?: string;
}

export declare interface LayerGroup {
    id: string;
    name: string;
}

export declare type LayerType = 'text' | 'image' | 'shape' | 'qr' | 'background' | 'barcode' | 'line' | 'frame' | 'textsvg' | 'table-svg' | 'chart-svg';

export declare interface LogicCondition {
    left?: Operand;
    operator: OperatorType;
    right?: Operand;
    output?: Operand;
    propertyOverrides?: Record<string, any>;
}

export declare interface LogicRule {
    id: string;
    name?: string;
    type: RuleType;
    enabled: boolean;
    operator?: OperatorType;
    left?: Operand;
    right?: Operand;
    output?: Operand;
    inputs?: Operand[];
    conditions?: LogicCondition[];
    falseOutput?: Operand;
    elsePropertyOverrides?: Record<string, any>;
    randomMode?: 'number' | 'string';
    randomLength?: number;
    textFormatMode?: 'uppercase' | 'lowercase' | 'capitalize';
    dateMathUnit?: 'days' | 'months' | 'years';
}

export declare interface Operand {
    type: 'variable' | 'literal' | 'template' | 'node';
    value: string;
}

export declare type OperatorType = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'starts_with' | 'regex' | '+' | '-' | '*' | '/' | 'average' | 'concat';

export declare interface PreviewOptions {
    templateId: string;
    payload?: Record<string, any>;
    container: HTMLElement;
    scale?: number;
}

export declare interface RenderOptions {
    templateId: string;
    payload?: Record<string, any>;
    format?: 'pdf' | 'png';
    quality?: 'draft' | 'standard' | 'high' | 'ultra';
    side?: 'front' | 'back' | 'both';
}

export declare interface RenderResult {
    blob: Blob;
    mimeType: string;
    sizeKB: number;
}

export declare type RuleType = 'if' | 'else-if' | 'else' | 'compute' | 'output' | 'average' | 'round' | 'random' | 'text_format' | 'date_math';

export declare interface SmartLogicConfig {
    rules: LogicRule[];
    fallback?: string;
}

export declare interface TableCell {
    bg: string;
    content: string;
    fontSize: number;
    fontFamily: string;
    fontWeight: string;
    fontStyle?: 'normal' | 'italic';
    color: string;
    textAlign: 'left' | 'center' | 'right';
    verticalAlign: 'top' | 'middle' | 'bottom';
    padding: number;
}

export declare interface TableData {
    rows: number;
    cols: number;
    colWidths: number[];
    rowHeights: number[];
    cells: TableCell[][];
    borderColor: string;
    borderWidth: number;
}

export { }
