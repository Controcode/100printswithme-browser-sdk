// --- App & Editor Core Types ---
export type LayerType = 'text' | 'image' | 'shape' | 'qr' | 'background' | 'barcode' | 'line' | 'frame' | 'textsvg' | 'table-svg' | 'chart-svg';
export type DocType = 'id-card' | 'certificate';
export type AppStep = 'landing' | 'setup' | 'editor' | 'finalize' | 'feedback';
export type ColumnType = 'text' | 'image' | 'qr' | 'date';

// --- Smart Logic Engine Types ---

// Merged: Legacy comparison operators + New mathematical/string operators
export type OperatorType =
  | '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'starts_with' | 'regex' // Comparisons
  | '+' | '-' | '*' | '/' | 'average' | 'concat'; // Computations

// Merged: Legacy logic flow + New Node-Based architecture
export type RuleType = 'if' | 'else-if' | 'else' | 'compute' | 'output' | 'average' | 'round' | 'random' | 'text_format' | 'date_math';

// Added 'node' to support dependency graph connections
export interface Operand {
  type: 'variable' | 'literal' | 'template' | 'node';
  value: string;
}

// Represents a single branch in an IF/ELSE-IF chain switchboard
export interface LogicCondition {
  left?: Operand;
  operator: OperatorType;
  right?: Operand;
  output?: Operand; // What to return if this specific condition is true
  propertyOverrides?: Record<string, any>; // Style overrides for this condition
}

export interface LogicRule {
  id: string;
  name?: string; // Used for UI Node naming (e.g., 'A', 'B', 'OUT')
  type: RuleType;
  enabled: boolean;

  // Standard, Compute, Round, and Legacy Properties
  operator?: OperatorType;
  left?: Operand;
  right?: Operand;
  output?: Operand; // Used for terminal returns & legacy compatibility

  // Dynamic Node Properties
  inputs?: Operand[];             // Holds infinite inputs for the Average Node
  conditions?: LogicCondition[];  // Holds IF/ELSE-IF branches for the new IF Node
  falseOutput?: Operand;          // Holds the final Fallback ELSE for the new IF Node
  elsePropertyOverrides?: Record<string, any>; // Holds property overrides for the ELSE branch

  // Random Node Properties
  randomMode?: 'number' | 'string';
  randomLength?: number;

  // Text Format Properties
  textFormatMode?: 'uppercase' | 'lowercase' | 'capitalize';

  // Date Math Properties
  dateMathUnit?: 'days' | 'months' | 'years';
}

export interface SmartLogicConfig {
  rules: LogicRule[];
  fallback?: string; // Legacy support
}

// --- Table Types ---
export interface TableCell {
  bg: string;              // cell background color
  content: string;         // text content or {{variable}}
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  fontStyle?: 'normal' | 'italic';
  color: string;           // text color
  textAlign: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  padding: number;
}

export interface TableData {
  rows: number;
  cols: number;
  colWidths: number[];     // pixel widths, summing to layer.width
  rowHeights: number[];    // pixel heights, summing to layer.height
  cells: TableCell[][];   // [row][col]
  borderColor: string;
  borderWidth: number;
}

// --- Chart Types ---
export type ChartSubtype =
  // Bar charts
  | 'bar' | 'row' | 'categorical-bar' | 'categorical-row'
  | 'grouped-bar' | 'grouped-row' | 'stacked-bar' | 'stacked-row' | 'stacked-proportional'
  // Line charts
  | 'line' | 'multi-line'
  // Pie & Donut
  | 'pie' | 'donut'
  // Infographics
  | 'progress-ring' | 'radial-progress' | 'progress-bar' | 'progress-dial';

export interface ChartDataSeries {
  label: string;
  values: string[];
  color: string;
}

export interface ChartData {
  subtype: ChartSubtype;
  title?: string;

  // Data
  categories: string[];
  series: ChartDataSeries[];

  // For infographics (progress-*)
  percentage?: string;

  // Visual customization
  colors: string[];
  showLabels: boolean;
  showLegend: boolean;
  showGrid: boolean;
  showValues: boolean;

  // Bar-specific
  barWidth?: number;
  barGap?: number;
  barRadius?: number;

  // Line-specific
  lineWidth?: number;
  lineSmooth?: boolean;
  showDots?: boolean;
  dotRadius?: number;

  // Pie/Donut-specific
  donutWidth?: number;
  startAngle?: number;

  // Progress-specific
  trackColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  roundedEnds?: boolean;
  showPercentageLabel?: boolean;

  // Typography
  fontSize?: number;
  fontFamily?: string;
  labelColor?: string;

  // Axes
  axisColor?: string;
  gridColor?: string;
}

// --- Document & Rendering Types ---

export interface LayerGroup {
  id: string;
  name: string;
}

export interface Layer {
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

  // Table-specific data
  tableData?: TableData;

  // Chart-specific data
  chartData?: ChartData;

  groupId?: string;
}

export interface DocumentTemplate {
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
  dimensions: { width: number; height: number; label: string };

  integration_type?: string;
  data_source_id?: string | null;
  template_data?: any;
  sample_data?: {
    fileName?: string;
    headers?: string[];
    rows?: any[];
  };
  // ── NEW: Community & Firebase Metadata ──
  docType?: DocType;        // Tells the hub whether to open CertificateEditor or IDCardEditor
  author?: string;          // Stores the name of the community contributor
  createdAt?: string | any; // Allows Firebase serverTimestamp() or ISO strings
  downloads?: number;       // (Optional) Track how many people use this template
  isCommunity?: boolean;    // Flag to easily distinguish defaults from fetched templates
}

export interface BulkData {
  headers: string[];
  columnMetadata?: Record<string, ColumnType>;
  rows: Record<string, string>[];
  fileName: string;
  _source: 'cloud' | 'local';
}

export interface EditorState {
  currentTemplate: DocumentTemplate;
  selectedLayerId: string | null;
  activeSide: 'front' | 'back';
  zoom: number;
}