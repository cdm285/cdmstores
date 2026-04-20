/**
 * CDM STORES — Agent System Barrel Export
 * Central re-export of all agent modules.
 * Import from here to access any agent in the system.
 */

// ─── Core Types ───────────────────────────────────────────────────────────────
export * from '../core/types.js';

// ─── Security (Agents 27–28) ──────────────────────────────────────────────────
export {
    ContentFilterAgent, contentFilterAgent, SecurityAgent, securityAgent
} from './security.js';

// ─── Personality (Agents 13–15) ───────────────────────────────────────────────
export {
    EmotionAgent, emotionAgent, PersonalityAgent, personalityAgent, StyleAgent, styleAgent
} from './personality.js';

// ─── Actions (Agents 17–24, 26, 41–42) ───────────────────────────────────────
export {
    CartAgent, cartAgent, CouponAgent, couponAgent, EscalationAgent, escalationAgent, FallbackAgent, fallbackAgent, NotificationAgent, notificationAgent, OrderAgent, orderAgent, PaymentAgent, paymentAgent, ProductAgent, productAgent, SchedulingAgent, schedulingAgent, TrackingAgent, trackingAgent, WhatsAppAgent, whatsAppAgent
} from './actions.js';

// ─── Quality (Agents 29–33, 55, 61, 79) ──────────────────────────────────────
export {
    CoherenceAgent, coherenceAgent, ErrorCorrectionAgent, errorCorrectionAgent, QualityAgent, qualityAgent, QualityCheckAgent, qualityCheckAgent, SelfCorrectionAgent, selfCorrectionAgent, SelfRepairAgent, selfRepairAgent, ValidationAgent, validationAgent
} from './quality.js';

// ─── Monitoring (Agents 43–44, 47, 49, 55–90 partial) ────────────────────────
export {
    AuditAgent, auditAgent, ContinuityCheckAgent, continuityCheckAgent, FlowCheckAgent, flowCheckAgent, HealthAgent, healthAgent, LogAgent, logAgent, MemoryCheckAgent, memoryCheckAgent, MonitoringAgent, monitoringAgent, PerformanceCheckAgent, performanceCheckAgent, ResponseCheckAgent, responseCheckAgent, SecurityCheckAgent, securityCheckAgent, SelfConsistencyAgent, selfConsistencyAgent, SelfLearningAgent, selfLearningAgent, SelfOptimizationAgent, selfOptimizationAgent
} from './monitoring.js';
