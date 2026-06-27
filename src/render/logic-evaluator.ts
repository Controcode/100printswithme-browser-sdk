import { SmartLogicConfig, OperatorType, Operand, LogicRule } from '../types';

/**
 * Standard variable interpolation helper
 */
const interpolateVariables = (str: string, rowData: Record<string, any>): string => {
  const varRegex = /\{\{(.+?)\}\}/g;
  return str.replace(varRegex, (_, key) => {
    const val = rowData[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
};

/**
 * Resolves an operand (Variable/Literal/Template/Node) to a final value.
 * Point 4: Variables are automatically converted to numeric if possible for comparisons.
 */
const resolveOperand = (
  operand: Operand | undefined, 
  rowData: Record<string, any>,
  resolveNode?: (nodeId: string) => any // NEW: Optional callback to fetch node outputs
): any => {
  if (!operand) return '';
  switch (operand.type) {
    case 'node':
      // Fetch the computed value of the referenced node using the graph engine
      return resolveNode ? resolveNode(operand.value) : '';
    case 'variable':
      const val = rowData[operand.value] ?? '';
      const numVal = Number(val);
      // If it's a valid number and not empty/whitespace, treat as number
      return (!isNaN(numVal) && String(val).trim() !== '') ? numVal : val;
    case 'template':
      return interpolateVariables(operand.value, rowData);
    case 'literal':
    default:
      const litVal = operand.value;
      const litNum = Number(litVal);
      return (!isNaN(litNum) && String(litVal).trim() !== '') ? litNum : litVal;
  }
};

/**
 * Safely evaluates a comparison between two values.
 * Point 4: Automatically handles numeric comparisons.
 */
const compare = (leftVal: any, operator: OperatorType, rightVal: any): boolean => {
  const isNumeric = typeof leftVal === 'number' && typeof rightVal === 'number';
  
  if (isNumeric) {
    switch (operator) {
      case '==': return leftVal === rightVal;
      case '!=': return leftVal !== rightVal;
      case '>': return leftVal > rightVal;
      case '<': return leftVal < rightVal;
      case '>=': return leftVal >= rightVal;
      case '<=': return leftVal <= rightVal;
      default: return false;
    }
  }

  // Fallback to string comparison
  const a = String(leftVal).toLowerCase();
  const b = String(rightVal).toLowerCase();

  switch (operator) {
    case '==': return a === b;
    case '!=': return a !== b;
    case 'contains': return a.includes(b);
    case 'starts_with': return a.startsWith(b);
    case 'regex': 
      try { return new RegExp(String(rightVal), 'i').test(String(leftVal)); } 
      catch { return false; }
    default: return false;
  }
};

/**
 * Executes a mathematical or string operation.
 */
const performComputation = (leftVal: any, operator: OperatorType, rightVal: any): any => {
  const lNum = Number(leftVal);
  const rNum = Number(rightVal);
  const isNumeric = !isNaN(lNum) && !isNaN(rNum) && String(leftVal).trim() !== '' && String(rightVal).trim() !== '';

  switch (operator) {
    case '+': return isNumeric ? lNum + rNum : String(leftVal) + String(rightVal);
    case '-': return isNumeric ? lNum - rNum : NaN;
    case '*': return isNumeric ? lNum * rNum : NaN;
    case '/': return isNumeric && rNum !== 0 ? lNum / rNum : NaN;
    case 'concat': return String(leftVal) + String(rightVal);
    default: return leftVal;
  }
};

/**
 * Primary entry point for layer content resolution.
 */
export const evaluateSmartLogic = (content: string, rowData: Record<string, any>, logicConfig?: SmartLogicConfig): string => {
  // 1. Process Structured Block Logic
  if (logicConfig && logicConfig.rules && logicConfig.rules.length > 0) {
    
    const nodeCache: Record<string, any> = {};
    const visited = new Set<string>();

    // --- RECURSIVE GRAPH ENGINE ---
    const evaluateNode = (nodeId: string): any => {
      if (nodeCache[nodeId] !== undefined) return nodeCache[nodeId];
      if (visited.has(nodeId)) {
        console.error(`Circular dependency detected at node: ${nodeId}`);
        return null; 
      }
      visited.add(nodeId);

      const rule = logicConfig.rules.find(r => r.id === nodeId);
      if (!rule || !rule.enabled) return null;

      const resolve = (operand?: Operand) => resolveOperand(operand, rowData, evaluateNode);
      let result: any = null;

      if (rule.type === 'output') {
        result = resolve(rule.left);
      } 
      else if (rule.type === 'compute') {
        result = performComputation(resolve(rule.left), rule.operator || '+', resolve(rule.right));
      } 
      else if (rule.type === 'average') {
        if (!rule.inputs || rule.inputs.length === 0) result = 0;
        else {
          let sum = 0;
          let validCount = 0;
          for (const inp of rule.inputs) {
            if (!inp) continue;
            const val = resolve(inp);
            const num = Number(val);
            if (!isNaN(num) && String(val).trim() !== '') {
              sum += num;
              validCount++;
            }
          }
          result = validCount > 0 ? sum / validCount : 0;
        }
      }
      
      // NEW: ROUND NODE LOGIC
      else if (rule.type === 'round') {
        const valueToRound = resolve(rule.left);
        const precisionVal = resolve(rule.right);
        
        const num = Number(valueToRound);
        // Default to 0 decimal places if not provided
        const decimals = Math.max(0, Number(precisionVal) || 0); 
        
        if (!isNaN(num)) {
          const factor = Math.pow(10, decimals);
          result = Math.round(num * factor) / factor;
        } else {
          result = valueToRound; // If it's not a number, just pass it through safely
        }
      } 
      // NEW: RANDOM NODE LOGIC
      else if (rule.type === 'random') {
        const len = rule.randomLength || 8;
        let str = '';
        if (rule.randomMode === 'string') {
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
          for (let i = 0; i < len; i++) str += chars.charAt(Math.floor(Math.random() * chars.length));
        } else {
          for (let i = 0; i < len; i++) str += Math.floor(Math.random() * 10).toString();
        }
        result = str;
      }
      // NEW: TEXT FORMAT NODE LOGIC
      else if (rule.type === 'text_format') {
        const val = String(resolve(rule.left) || '');
        if (rule.textFormatMode === 'uppercase') result = val.toUpperCase();
        else if (rule.textFormatMode === 'lowercase') result = val.toLowerCase();
        else if (rule.textFormatMode === 'capitalize') {
          result = val.replace(/\b\w/g, c => c.toUpperCase());
        } else {
          result = val;
        }
      }
      // NEW: DATE MATH NODE LOGIC
      else if (rule.type === 'date_math') {
        const dateStr = resolve(rule.left);
        const baseDate = new Date(dateStr);
        if (isNaN(baseDate.getTime())) {
          result = dateStr; // Fallback to original string if invalid
        } else {
          const amount = Number(resolve(rule.right)) || 0;
          if (rule.dateMathUnit === 'years') {
            baseDate.setFullYear(baseDate.getFullYear() + (rule.operator === '-' ? -amount : amount));
          } else if (rule.dateMathUnit === 'months') {
            baseDate.setMonth(baseDate.getMonth() + (rule.operator === '-' ? -amount : amount));
          } else { // 'days' or default
            baseDate.setDate(baseDate.getDate() + (rule.operator === '-' ? -amount : amount));
          }
          result = baseDate.toISOString().split('T')[0];
        }
      }

      else if (rule.type === 'if') {
        let conditionMet = false;
        
        // Multi-Condition Switchboard (IF / ELSE-IF)
        if (rule.conditions && rule.conditions.length > 0) {
          for (const cond of rule.conditions) {
            const isTrue = compare(resolve(cond.left), cond.operator || '==', resolve(cond.right));
            if (isTrue) {
              result = resolve(cond.output);
              conditionMet = true;
              break; // Stop evaluating further branches
            }
          }
        }
        
        // Fallback ELSE
        if (!conditionMet) {
          result = resolve(rule.falseOutput);
        }
      }

      nodeCache[nodeId] = result;
      return result;
    };

    // Find the master Output Node to kick off graph execution
    const outputRule = logicConfig.rules.find(r => r.type === 'output');
    
    if (outputRule) {
      const finalOutput = evaluateNode(outputRule.id);
      return finalOutput !== null && finalOutput !== undefined ? String(finalOutput) : "Null";
    }

    // --- BACKWARDS COMPATIBILITY FALLBACK ---
    // If there is no 'Output' node, it assumes this is an older template and evaluates top-to-bottom
    for (const rule of logicConfig.rules) {
      if (!rule.enabled) continue;
      
      if (rule.type === 'else') {
        return String(resolveOperand(rule.output, rowData, evaluateNode));
      }

      const left = resolveOperand(rule.left, rowData, evaluateNode);
      const right = resolveOperand(rule.right, rowData, evaluateNode);
      
      if (rule.operator && compare(left, rule.operator, right)) {
        return String(resolveOperand(rule.output, rowData, evaluateNode));
      }
    }

    // Point 5: If logic is configured but no rules match, fallback to interpolation
    return interpolateVariables(content, rowData);
  }

  // 2. Fallback to Simple Interpolation
  if (!content || typeof content !== 'string') return content;
  return interpolateVariables(content, rowData);
};

export const evaluateLayerOverrides = (logicConfig: SmartLogicConfig | undefined, rowData: Record<string, any>): Record<string, any> => {
  if (!logicConfig || !logicConfig.rules || logicConfig.rules.length === 0) return {};

  const nodeCache: Record<string, any> = {};
  const visited = new Set<string>();

  const evaluateNode = (nodeId: string): any => {
    if (nodeCache[nodeId] !== undefined) return nodeCache[nodeId];
    if (visited.has(nodeId)) return null;
    visited.add(nodeId);

    const rule = logicConfig.rules.find(r => r.id === nodeId);
    if (!rule || !rule.enabled) return null;

    const resolve = (operand?: Operand) => resolveOperand(operand, rowData, evaluateNode);
    let result: any = null;

    if (rule.type === 'output') {
      result = resolve(rule.left);
    } 
    else if (rule.type === 'compute') {
      result = performComputation(resolve(rule.left), rule.operator || '+', resolve(rule.right));
    } 
    else if (rule.type === 'average') {
      if (!rule.inputs || rule.inputs.length === 0) result = 0;
      else {
        let sum = 0, validCount = 0;
        for (const inp of rule.inputs) {
          if (!inp) continue;
          const val = resolve(inp);
          const num = Number(val);
          if (!isNaN(num) && String(val).trim() !== '') {
            sum += num;
            validCount++;
          }
        }
        result = validCount > 0 ? sum / validCount : 0;
      }
    }
    else if (rule.type === 'round') {
      const valueToRound = resolve(rule.left);
      const precisionVal = resolve(rule.right);
      const num = Number(valueToRound);
      const decimals = Math.max(0, Number(precisionVal) || 0); 
      if (!isNaN(num)) {
        const factor = Math.pow(10, decimals);
        result = Math.round(num * factor) / factor;
      } else {
        result = valueToRound; 
      }
    }
    else if (rule.type === 'random') {
      const len = rule.randomLength || 8;
      let str = '';
      if (rule.randomMode === 'string') {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < len; i++) str += chars.charAt(Math.floor(Math.random() * chars.length));
      } else {
        for (let i = 0; i < len; i++) str += Math.floor(Math.random() * 10).toString();
      }
      result = str;
    }
    else if (rule.type === 'if') {
      let conditionMet = false;
      if (rule.conditions && rule.conditions.length > 0) {
        for (const cond of rule.conditions) {
          const isTrue = compare(resolve(cond.left), cond.operator || '==', resolve(cond.right));
          if (isTrue) {
            result = resolve(cond.output);
            conditionMet = true;
            break;
          }
        }
      }
      if (!conditionMet) {
        result = resolve(rule.falseOutput);
      }
    }

    nodeCache[nodeId] = result;
    return result;
  };

  for (const rule of logicConfig.rules) {
    if (rule.type !== 'if' || !rule.conditions) continue;
    
    let conditionMet = false;
    for (const cond of rule.conditions) {
      const resolve = (operand?: Operand) => resolveOperand(operand, rowData, evaluateNode);
      const isTrue = compare(resolve(cond.left), cond.operator || '==', resolve(cond.right));
      if (isTrue) {
        conditionMet = true;
        if (cond.propertyOverrides && Object.keys(cond.propertyOverrides).length > 0) {
          return cond.propertyOverrides;
        }
        break;
      }
    }
    
    if (!conditionMet) {
      if (rule.elsePropertyOverrides && Object.keys(rule.elsePropertyOverrides).length > 0) {
        return rule.elsePropertyOverrides;
      }
    }
  }

  return {};
};