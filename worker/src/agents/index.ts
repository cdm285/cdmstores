/**
 * CDM STORES — Agent System Barrel Export
 * Central re-export of all agent modules.
 * Import from here to access any agent in the system.
 */

// ─── Core Types ───────────────────────────────────────────────────────────────
export * from '../core/types.js';

// ─── Orchestrator (Agent 00) ──────────────────────────────────────────────────
export { orchestrator, Orchestrator } from './orchestrator.js';
export type { OrchestratorInput } from './orchestrator.js';

// ─── Security (Agents 27–28) ──────────────────────────────────────────────────
export {
  SecurityAgent,
  ContentFilterAgent,
  securityAgent,
  contentFilterAgent,
} from './security.js';

// ─── NLP / Intent / Language (Agents 01–03) ───────────────────────────────────
export {
  NLPAgent,
  IntentAgent,
  LanguageAgent,
  nlpAgent,
  intentAgent,
  languageAgent,
} from './nlp.js';

// ─── Memory (Agents 04–08) ────────────────────────────────────────────────────
export {
  ShortMemoryAgent,
  LongMemoryAgent,
  SemanticMemoryAgent,
  EpisodicMemoryAgent,
  ContextAgent,
  shortMemoryAgent,
  longMemoryAgent,
  semanticMemoryAgent,
  episodicMemoryAgent,
  contextAgent,
} from './memory.js';

// ─── Reasoning (Agents 09–12, 16) ────────────────────────────────────────────
export {
  PromptingAgent,
  ReasoningAgent,
  PlanningAgent,
  SummarizationAgent,
  promptingAgent,
  reasoningAgent,
  planningAgent,
  summarizationAgent,
} from './reasoning.js';

// ─── Personality (Agents 13–15) ───────────────────────────────────────────────
export {
  EmotionAgent,
  PersonalityAgent,
  StyleAgent,
  emotionAgent,
  personalityAgent,
  styleAgent,
} from './personality.js';

// ─── Actions (Agents 17–24, 26, 41–42) ───────────────────────────────────────
export {
  CartAgent,
  OrderAgent,
  TrackingAgent,
  CouponAgent,
  ProductAgent,
  SchedulingAgent,
  WhatsAppAgent,
  NotificationAgent,
  PaymentAgent,
  FallbackAgent,
  EscalationAgent,
  cartAgent,
  orderAgent,
  trackingAgent,
  couponAgent,
  productAgent,
  schedulingAgent,
  whatsAppAgent,
  notificationAgent,
  paymentAgent,
  fallbackAgent,
  escalationAgent,
} from './actions.js';

// ─── Quality (Agents 29–33, 55, 61, 79) ──────────────────────────────────────
export {
  QualityAgent,
  CoherenceAgent,
  ValidationAgent,
  ErrorCorrectionAgent,
  SelfRepairAgent,
  SelfCorrectionAgent,
  QualityCheckAgent,
  qualityAgent,
  coherenceAgent,
  validationAgent,
  errorCorrectionAgent,
  selfRepairAgent,
  selfCorrectionAgent,
  qualityCheckAgent,
} from './quality.js';

// ─── Monitoring (Agents 43–44, 47, 49, 55–90 partial) ────────────────────────
export {
  LogAgent,
  MonitoringAgent,
  AuditAgent,
  HealthAgent,
  SelfOptimizationAgent,
  SelfConsistencyAgent,
  SelfLearningAgent,
  SecurityCheckAgent,
  PerformanceCheckAgent,
  MemoryCheckAgent,
  FlowCheckAgent,
  ContinuityCheckAgent,
  ResponseCheckAgent,
  logAgent,
  monitoringAgent,
  auditAgent,
  healthAgent,
  selfOptimizationAgent,
  selfConsistencyAgent,
  selfLearningAgent,
  securityCheckAgent,
  performanceCheckAgent,
  memoryCheckAgent,
  flowCheckAgent,
  continuityCheckAgent,
  responseCheckAgent,
} from './monitoring.js';
