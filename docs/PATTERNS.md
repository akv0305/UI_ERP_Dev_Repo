# PATTERNS — copy the reference, never invent (verify content at the commit)
| Work | Reference |
| --- | --- |
| List screen | apps/web/app/(app)/hr/designations/ (page.tsx container, designations-list-client.tsx, designation-dialog.tsx) |
| Form / new / detail | apps/web/app/(app)/hr/employees/employee-form.tsx, new/page.tsx, [id]/page.tsx |
| Screen wording | hr/employees/_components/employee-text.ts + apps/web/config/terminology.ts |
| Import screen | apps/web/app/(app)/masters/items/import/item-import-client.tsx |
| Controller | apps/api/src/hr/employees.controller.ts |
| Service | apps/api/src/hr/employees.service.ts |
| Mapper | apps/api/src/hr/employees.mapper.ts |
| Errors | apps/api/src/hr/hr-errors.ts; base common/errors/api-error.ts |
| Excel import (API) | apps/api/src/items/import/ (xlsx-reader, import-sheet, import-matching, item-import.service/controller/errors) |
| Excel import (contract) | packages/contracts/src/item-import.ts |
| Entity contract | packages/contracts/src/hr.ts; permissions.ts; index.ts |
| Master codes (gapless) | apps/api/src/masters/code-series.ts |
| Document numbers | apps/api/src/documents/document-number.ts |
| Audit | apps/api/src/audit/audit.service.ts, audit-action.ts |
| Scope / access | apps/api/src/masters/scope.ts, access/access.service.ts |
| User from employee | apps/api/src/hr/employee-users.service.ts, employee-user-rules.ts; auth/password.service.ts |
| Dates (IST) | apps/api/src/hr/hr-dates.ts |
| Validation pipe | apps/api/src/common/pipes/zod-validation.pipe.ts |
| Spec | apps/api/src/hr/employees.service.spec.ts + masters/test-harness.ts (PDEF-047) |
| Module wiring | apps/api/src/hr/hr.module.ts |
