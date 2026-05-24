import { z } from 'zod';
import { WorkflowBuilder, StepState, ForkState, JoinState } from 'logic-workflow';
import type { WorkflowInstance } from 'logic-workflow';

const BriefingSchema = z.object({
  trainId:   z.string().min(1),
  routeCode: z.string().min(1),
  shiftTime: z.string().min(1),
});

const InspectionSchema = z.object({
  technicianId: z.string().min(1),
  notes:        z.string().optional(),
});

const SignOffSchema = z.object({
  engineerId: z.string().min(1),
  certifies:  z.literal(true),
});

const DepartSchema = z.object({
  platform:    z.number().int().min(1),
  scheduledAt: z.string().min(1),
});

export const predepartureWorkflow = new WorkflowBuilder('engineer-predeparture-checklist')
  .defineAction('BRIEFING_RECEIVED', BriefingSchema)
  .defineAction('START_INSPECTION',  z.object({}))
  .defineAction('MECH_OK',           InspectionSchema)
  .defineAction('ELEC_OK',           InspectionSchema)
  .defineAction('SAFETY_OK',         InspectionSchema)
  .defineAction('SIGN_OFF',          SignOffSchema)
  .defineAction('DEPART',            DepartSchema)

  .addState(new StepState('reported-for-duty',  { label: 'Reported for Duty' }))
  .addState(new StepState('briefed',            { label: 'Briefed' }))
  .addState(new ForkState('inspection-fork',    { label: 'Inspection Fork', targets: ['mechanical', 'electrical', 'safety-systems'] }))
  .addState(new StepState('mechanical',         { label: 'Mechanical Check' }))
  .addState(new StepState('electrical',         { label: 'Electrical Check' }))
  .addState(new StepState('safety-systems',     { label: 'Safety Systems Check' }))
  .addState(new JoinState('inspections-joined', { label: 'Inspections Complete', requires: ['mechanical', 'electrical', 'safety-systems'], mode: 'all' }))
  .addState(new StepState('signed-off',         { label: 'Signed Off' }))
  .addState(new StepState('departed',           { label: 'Departed' }))

  .setInitial('reported-for-duty')
  .setTerminal(['departed'])

  .addTransition({ from: 'reported-for-duty',  to: 'briefed',            on: 'BRIEFING_RECEIVED' })
  .addTransition({ from: 'briefed',            to: 'inspection-fork',    on: 'START_INSPECTION' })
  .addTransition({ from: 'mechanical',         to: 'inspections-joined', on: 'MECH_OK' })
  .addTransition({ from: 'electrical',         to: 'inspections-joined', on: 'ELEC_OK' })
  .addTransition({ from: 'safety-systems',     to: 'inspections-joined', on: 'SAFETY_OK' })
  .addTransition({ from: 'inspections-joined', to: 'signed-off',         on: 'SIGN_OFF',
    guard: (ctx) => ctx.payload.certifies === true })
  .addTransition({ from: 'signed-off',         to: 'departed',           on: 'DEPART' })

  .build();

export type PredepartureInstance = WorkflowInstance<{
  BRIEFING_RECEIVED: z.infer<typeof BriefingSchema>;
  START_INSPECTION:  Record<never, never>;
  MECH_OK:           z.infer<typeof InspectionSchema>;
  ELEC_OK:           z.infer<typeof InspectionSchema>;
  SAFETY_OK:         z.infer<typeof InspectionSchema>;
  SIGN_OFF:          z.infer<typeof SignOffSchema>;
  DEPART:            z.infer<typeof DepartSchema>;
}>;
