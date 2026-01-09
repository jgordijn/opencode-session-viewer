import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Part, StepFinishPart, ToolPart } from '../types/session';
import { isToolPart, isReasoningPart, isFilePart, isStepFinishPart } from '../types/session';
import { formatTokens, formatCost, formatDurationCompact } from '../utils/formatters';
import { PartRenderer } from './parts/PartRenderer';

interface StepProps {
  stepNumber: number;
  parts: Part[];
  defaultExpanded?: boolean;
}

export function Step({ stepNumber, parts, defaultExpanded = true }: StepProps) {
   const [isExpanded, setIsExpanded] = useState(defaultExpanded);

   // Find the step-finish part for stats
   const finishPart = parts.find(isStepFinishPart) as StepFinishPart | undefined;

   // Count parts by type for the summary
   const toolCount = parts.filter(isToolPart).length;
   const reasoningCount = parts.filter(isReasoningPart).length;
   const fileCount = parts.filter(isFilePart).length;

   // Calculate step duration from the earliest tool start to latest tool end
   let stepDuration: number | undefined;
   const toolParts = parts.filter(isToolPart);
   if (toolParts.length > 0) {
     let minStart: number | undefined;
     let maxEnd: number | undefined;

     for (const toolPart of toolParts) {
       const tool = toolPart as ToolPart;
       const state = tool.state;
       if (state.status === 'completed' || state.status === 'error') {
         if (minStart === undefined || state.time.start < minStart) {
           minStart = state.time.start;
         }
         if (maxEnd === undefined || state.time.end > maxEnd) {
           maxEnd = state.time.end;
         }
       }
     }

     if (minStart !== undefined && maxEnd !== undefined) {
       stepDuration = maxEnd - minStart;
     }
   }

   // Build summary string
   const summaryParts: string[] = [];
   if (toolCount > 0) summaryParts.push(`${toolCount} tool${toolCount !== 1 ? 's' : ''}`);
   if (reasoningCount > 0) summaryParts.push('thinking');
   if (fileCount > 0) summaryParts.push(`${fileCount} file${fileCount !== 1 ? 's' : ''}`);

  return (
    <div className="border-t border-gray-100 dark:border-gray-700 first:border-t-0">
      {/* Step header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        aria-expanded={isExpanded}
        aria-controls={`step-${stepNumber}-content`}
      >
        {/* Expand/collapse icon */}
        <span className="text-gray-400 dark:text-gray-500">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </span>

        {/* Step label */}
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
          Step {stepNumber}
        </span>

        {/* Summary when collapsed or as info */}
        {summaryParts.length > 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            ({summaryParts.join(', ')})
          </span>
        )}

         {/* Step stats on the right */}
         {finishPart && (
           <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
             {stepDuration !== undefined && (
               <>
                 {formatDurationCompact(stepDuration)} / 
               </>
             )}
             {formatTokens(finishPart.tokens.input + finishPart.tokens.output)} tokens
             {finishPart.cost > 0 && ` / ${formatCost(finishPart.cost)}`}
           </span>
         )}
      </button>

      {/* Step content */}
      {isExpanded && (
        <div
          id={`step-${stepNumber}-content`}
          className="pl-6 pb-4 space-y-3"
        >
          {parts.map((part) => (
            <PartRenderer key={part.id} part={part} />
          ))}
        </div>
      )}
    </div>
  );
}
