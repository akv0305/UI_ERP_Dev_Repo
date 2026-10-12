import { Controller, Get } from '@nestjs/common';
import type { StateListResponse } from '@uie/contracts';
import { StatesService } from './states.service';

/** Any signed-in user may read the state list (no permission required). */
@Controller('states')
export class StatesController {
  constructor(private readonly states: StatesService) {}

  @Get()
  list(): Promise<StateListResponse> {
    return this.states.list();
  }
}
