import { useState, useEffect, useCallback } from 'react';
import { Bot, ChevronDown, ChevronRight } from 'lucide-react';
import type { AssistantMessage, Part } from '../types/session';
import { isStepStartPart } from '../types/session';
import { getAssistantStats } from '../utils/groupMessages';
import { formatCost, formatTokens, formatDurationCompact } from '../utils/formatters';
import { Step } from './Step';
import { PartRenderer } from './parts/PartRenderer';

interface AssistantResponseProps {
  messages: AssistantMessage[];
  messageId: string;
  defaultExpanded?: boolean;
}

interface StepData {
  stepNumber: number;
  parts: Part[];
}

/**
 * Groups parts into steps based on step-start markers.
 * Parts before any step-start are considered step 1.
 */
function groupPartsIntoSteps(messages: AssistantMessage[]): StepData[] {
  const steps: StepData[] = [];
  let currentStep: Part[] = [];
  let stepNumber = 0;

  for (const message of messages) {
    for (const part of message.parts) {
      if (isStepStartPart(part)) {
        // If we have parts accumulated before a step-start, save them
        if (currentStep.length > 0) {
          steps.push({ stepNumber, parts: currentStep });
        }
        stepNumber++;
        currentStep = [];
      } else {
        // If no step has started yet, start step 1
        if (stepNumber === 0) {
          stepNumber = 1;
        }
        currentStep.push(part);
      }
    }
  }

  // Save the last step if it has parts
  if (currentStep.length > 0) {
    steps.push({ stepNumber: stepNumber || 1, parts: currentStep });
  }

  return steps;
}

export function AssistantResponse({ messages, messageId, defaultExpanded = true }: AssistantResponseProps) {
   const [isExpanded, setIsExpanded] = useState(defaultExpanded);

   // Listen for toggle-collapse events from keyboard shortcuts
   const handleToggleCollapse = useCallback((e: Event) => {
     const customEvent = e as CustomEvent<{ messageId: string }>;
     if (customEvent.detail.messageId === messageId) {
       setIsExpanded(prev => !prev);
     }
   }, [messageId]);

   useEffect(() => {
     window.addEventListener('toggle-collapse', handleToggleCollapse);
     return () => window.removeEventListener('toggle-collapse', handleToggleCollapse);
   }, [handleToggleCollapse]);

   if (messages.length === 0) {
     return null;
   }

   const stats = getAssistantStats(messages);
   const steps = groupPartsIntoSteps(messages);

   // Calculate totals from all messages
   const totalTokens = messages.reduce((sum, msg) => {
     return sum + msg.info.tokens.input + msg.info.tokens.output;
   }, 0);
   const totalCost = messages.reduce((sum, msg) => sum + msg.info.cost, 0);

   // Calculate total duration from first message created to last message completed
   let totalDuration: number | undefined;
   if (messages.length > 0) {
     const firstCreated = messages[0].info.time.created;
     // Try to find the last completed message, or use the last message's created time as fallback
     let lastTime: number | undefined;
     for (let i = messages.length - 1; i >= 0; i--) {
       if (messages[i].info.time.completed) {
         lastTime = messages[i].info.time.completed;
         break;
       }
     }
     // If no completed time found, use the last message's created time
     if (!lastTime && messages.length > 0) {
       lastTime = messages[messages.length - 1].info.time.created;
     }
     if (lastTime && firstCreated) {
       totalDuration = lastTime - firstCreated;
     }
   }

  // Build summary for collapsed state
  const summaryParts: string[] = [];
  if (stats.stepCount > 0) summaryParts.push(`${stats.stepCount} step${stats.stepCount !== 1 ? 's' : ''}`);
  if (stats.toolCount > 0) summaryParts.push(`${stats.toolCount} tool${stats.toolCount !== 1 ? 's' : ''}`);
  if (stats.hasReasoning) summaryParts.push('thinking');

  // Generate unique ID for accessibility
  const contentId = `assistant-response-${messages[0].info.id}`;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        aria-expanded={isExpanded}
        aria-controls={contentId}
        aria-label={isExpanded ? 'Collapse assistant response' : 'Expand assistant response'}
      >
        {/* Expand/collapse icon */}
        <span className="text-gray-400 dark:text-gray-500">
          {isExpanded ? (
            <ChevronDown className="w-5 h-5" />
          ) : (
            <ChevronRight className="w-5 h-5" />
          )}
        </span>

        {/* Bot icon */}
        <div className="p-1.5 bg-green-100 dark:bg-green-800 rounded-md">
          <Bot className="w-4 h-4 text-green-600 dark:text-green-400" />
        </div>

        {/* Label */}
        <span className="text-sm font-medium text-green-700 dark:text-green-300">
          Assistant
        </span>

        {/* Summary */}
        {summaryParts.length > 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {summaryParts.join(', ')}
          </span>
        )}

        {/* Stats on the right */}
         <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
           {totalDuration !== undefined && (
             <>
               {formatDurationCompact(totalDuration)} / 
             </>
           )}
           {formatTokens(totalTokens)} tokens
           {totalCost > 0 && ` / ${formatCost(totalCost)}`}
         </span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div id={contentId} className="border-t border-gray-100 dark:border-gray-700 px-4">
          {steps.length === 0 ? (
            <p className="py-4 text-sm text-gray-500 dark:text-gray-400 italic">
              No content
            </p>
          ) : steps.length === 1 ? (
            // Single step - don't show step header, just show content
            <div className="py-4 space-y-3">
              {steps[0].parts.map((part) => (
                <PartRenderer key={part.id} part={part} />
              ))}
            </div>
          ) : (
            // Multiple steps - show each in a Step component
            steps.map((step) => (
              <Step
                key={step.stepNumber}
                stepNumber={step.stepNumber}
                parts={step.parts}
                defaultExpanded={true}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
