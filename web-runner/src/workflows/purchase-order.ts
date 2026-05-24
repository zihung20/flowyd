import { z } from 'zod';
import { WorkflowBuilder, StepState } from 'logic-workflow';
import type { WorkflowInstance } from 'logic-workflow';

const SubmitSchema = z.object({
  submittedBy: z.string().min(1),
  vendor:      z.string().min(1),
  amount:      z.number().positive(),
  description: z.string().min(1),
});

const ReviewSchema = z.object({
  reviewerId: z.string().min(1),
});

const ApproveSchema = z.object({
  approvedBy: z.string().min(1),
  notes:      z.string(),
});

const RejectSchema = z.object({
  rejectedBy: z.string().min(1),
  reason:     z.string().min(1),
});

const FulfillSchema = z.object({
  fulfilledBy:  z.string().min(1),
  deliveryDate: z.string().min(1),
});

export const purchaseOrderWorkflow = new WorkflowBuilder('purchase-order')
  .defineAction('SUBMIT',   SubmitSchema)
  .defineAction('REVIEW',   ReviewSchema)
  .defineAction('APPROVE',  ApproveSchema)
  .defineAction('REJECT',   RejectSchema)
  .defineAction('FULFILL',  FulfillSchema)

  .addState(new StepState('draft',        { label: 'Draft' }))
  .addState(new StepState('submitted',    { label: 'Submitted' }))
  .addState(new StepState('under-review', { label: 'Under Review' }))
  .addState(new StepState('approved',     { label: 'Approved' }))
  .addState(new StepState('rejected',     { label: 'Rejected' }))
  .addState(new StepState('fulfilled',    { label: 'Fulfilled' }))

  .setInitial('draft')
  .setTerminal(['fulfilled', 'rejected'])

  .addTransition({ from: 'draft',        to: 'submitted',    on: 'SUBMIT' })
  .addTransition({ from: 'submitted',    to: 'under-review', on: 'REVIEW' })
  .addTransition({ from: 'under-review', to: 'approved',     on: 'APPROVE',
    guard: (ctx) => ctx.payload.approvedBy.trim().length > 0 })
  .addTransition({ from: 'under-review', to: 'rejected',     on: 'REJECT' })
  .addTransition({ from: 'approved',     to: 'fulfilled',    on: 'FULFILL' })

  .build();

export type PurchaseOrderInstance = WorkflowInstance<{
  SUBMIT:  z.infer<typeof SubmitSchema>;
  REVIEW:  z.infer<typeof ReviewSchema>;
  APPROVE: z.infer<typeof ApproveSchema>;
  REJECT:  z.infer<typeof RejectSchema>;
  FULFILL: z.infer<typeof FulfillSchema>;
}>;
