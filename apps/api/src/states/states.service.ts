import { HttpStatus, Injectable } from '@nestjs/common';
import type { State } from '@prisma/client';
import type { StateListResponse, StateResponse } from '@uie/contracts';
import { ApiError } from '../common/errors/api-error';
import { PrismaService } from '../prisma/prisma.service';

export function toStateResponse(state: State): StateResponse {
  return { id: state.id, gstCode: state.gstCode, name: state.name, isActive: state.isActive };
}

@Injectable()
export class StatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<StateListResponse> {
    const states = await this.prisma.state.findMany({ orderBy: { gstCode: 'asc' } });

    return { items: states.map(toStateResponse) };
  }

  /**
   * The state must exist and be active. A record that already uses an inactive state
   * may keep it (`unchangedFrom`), so old data stays editable.
   */
  async assertUsable(stateId: string, unchangedFrom: string | null = null): Promise<State> {
    const state = await this.prisma.state.findUnique({ where: { id: stateId } });

    if (state === null || (!state.isActive && stateId !== unchangedFrom)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_STATE',
        'The selected state is not valid',
      );
    }

    return state;
  }
}
