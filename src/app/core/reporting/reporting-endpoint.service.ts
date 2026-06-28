import { Injectable } from '@angular/core';
import type { PipelineReport } from './models/pipeline-report.model';

export interface ReportPostResult {
  ok: boolean;
  status: number;
}

@Injectable({ providedIn: 'root' })
export class ReportingEndpointService {
  private readonly reportEndpointUrl = 'http://127.0.0.1:4319/pipeline-reports';

  // Migration note:
  // This block starts the new endpoint-reporting path for app-next. It does not replace the legacy
  // verification endpoint yet, but it establishes the early simulation/pass-style report transport
  // that future rebuilt generator stages will use.

  // Endpoint logging step.
  // Input: a typed PipelineReport ready for durable logging.
  // Output: an HTTP result indicating whether the report was accepted by the endpoint.
  // This block owns network transport only. It does not generate or validate report content.
  async postReport(report: PipelineReport): Promise<ReportPostResult> {
    const response = await fetch(this.reportEndpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(report),
    });

    return {
      ok: response.ok,
      status: response.status,
    };
  }

  async getReportHistory(): Promise<unknown> {
    const response = await fetch(this.reportEndpointUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    return response.json();
  }
}
