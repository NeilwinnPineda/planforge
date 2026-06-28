import { effect, inject, Injectable, signal } from '@angular/core';
import { ConstructionOutputService } from './construction-output.service';
import { buildConstructionContract } from './construction-contract.factory';
import type { ConstructionContractExport } from './construction-contract.model';

export type ContractPushStatus = 'pending' | 'pushing' | 'pushed' | 'failed';

@Injectable({ providedIn: 'root' })
export class ConstructionContractPushService {
  private readonly outputsService = inject(ConstructionOutputService);
  private readonly endpointUrl = 'http://localhost:8765/layout-contract';

  private readonly _statusMap = signal<ReadonlyMap<string, ContractPushStatus>>(new Map());
  readonly statusMap = this._statusMap.asReadonly();

  constructor() {
    effect(() => {
      const outputs = this.outputsService.outputs();
      const current = this._statusMap();

      const newEntries: Array<[string, ContractPushStatus]> = [];
      for (const output of outputs) {
        const id = output.entry.artifact.layoutId;
        if (!current.has(id)) {
          newEntries.push([id, 'pending']);
        }
      }

      if (!newEntries.length) return;

      this._statusMap.update((map) => {
        const next = new Map(map);
        newEntries.forEach(([id, status]) => next.set(id, status));
        return next;
      });

      for (const output of outputs) {
        const id = output.entry.artifact.layoutId;
        if (current.has(id)) continue;
        void this.push(buildConstructionContract(output));
      }
    });
  }

  statusFor(layoutId: string): ContractPushStatus {
    return this._statusMap().get(layoutId) ?? 'pending';
  }

  private async push(contract: ConstructionContractExport): Promise<void> {
    this.setStatus(contract.layoutId, 'pushing');
    try {
      const response = await fetch(this.endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contract),
      });
      this.setStatus(contract.layoutId, response.ok ? 'pushed' : 'failed');
    } catch {
      this.setStatus(contract.layoutId, 'failed');
    }
  }

  private setStatus(layoutId: string, status: ContractPushStatus): void {
    this._statusMap.update((map) => {
      const next = new Map(map);
      next.set(layoutId, status);
      return next;
    });
  }
}
