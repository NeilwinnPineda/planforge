import { Component, inject } from '@angular/core';
import { NgFor, JsonPipe } from '@angular/common';
import { DESIGN_SOURCE, DESIGN_SOURCE_VALIDATION, SourceReadService } from '../../../core/source/source.exports';
import { buildReportingSelfTestReports } from '../../../core/reporting/reporting-self-test.factory';
import { ReportingEndpointService } from '../../../core/reporting/reporting-endpoint.service';
import type { PipelineReport } from '../../../core/reporting/models/pipeline-report.model';

@Component({
  selector: 'app-reporting-baseline-page',
  standalone: true,
  imports: [NgFor, JsonPipe],
  templateUrl: './reporting-baseline-page.component.html',
  styleUrl: './reporting-baseline-page.component.scss',
})
export class ReportingBaselinePageComponent {
  private readonly sourceReadService = inject(SourceReadService);
  private readonly reportingEndpointService = inject(ReportingEndpointService);

  protected readonly sourceSnapshot = this.sourceReadService.getActiveSourceSnapshot();
  protected readonly selfTestReports = buildReportingSelfTestReports(this.sourceSnapshot);
  protected endpointStatusText = 'Endpoint not checked yet.';
  protected lastHistorySnapshot: unknown = null;
  protected readonly localSourceId = DESIGN_SOURCE.meta.id;
  protected readonly localSourceStatus = DESIGN_SOURCE_VALIDATION.status;

  protected async sendSelfTestReports(): Promise<void> {
    const results = await Promise.all(
      this.selfTestReports.map((report) => this.reportingEndpointService.postReport(report)),
    );
    const failed = results.filter((result) => !result.ok);
    this.endpointStatusText = failed.length
      ? `Posting incomplete: ${failed.length} report(s) failed.`
      : `Posted ${results.length} report(s) successfully.`;
  }

  protected async loadHistory(): Promise<void> {
    try {
      this.lastHistorySnapshot = await this.reportingEndpointService.getReportHistory();
      this.endpointStatusText = 'Loaded endpoint history successfully.';
    } catch (error) {
      this.endpointStatusText = `History load failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  protected polygonLabel(report: PipelineReport): string {
    return `${report.artifactSummary.polygonCount} polygons / score ${report.selectionMetrics.score}`;
  }
}
