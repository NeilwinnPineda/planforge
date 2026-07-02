import { computed, Injectable, signal } from '@angular/core';
import type { NamedGeometryPoint } from '../geometry/geometry.exports';
import { DESIGN_SOURCE, DESIGN_SOURCE_VALIDATION } from './source-data';
import type {
  DesignSourceValidationResult,
  ProjectLotSegment,
  PromptDesignSource,
  RoomPrototype,
} from './models/design-source.model';
import { validateDesignSource } from './source-validation';

export interface SourceReadSnapshot {
  readonly source: PromptDesignSource;
  readonly validation: DesignSourceValidationResult;
  readonly origin: 'default' | 'imported';
}

@Injectable({ providedIn: 'root' })
export class SourceReadService {
  private readonly activeSource = signal<PromptDesignSource>(DESIGN_SOURCE);
  private readonly sourceOrigin = signal<'default' | 'imported'>('default');

  readonly activeSourceSnapshot = computed((): SourceReadSnapshot => ({
    source: this.activeSource(),
    validation: validateDesignSource(this.activeSource()),
    origin: this.sourceOrigin(),
  }));

  getActiveSourceSnapshot(): SourceReadSnapshot {
    return this.activeSourceSnapshot();
  }

  importSourceJson(jsonText: string): SourceReadSnapshot {
    const parsed = JSON.parse(jsonText) as PromptDesignSource;
    const validation = validateDesignSource(parsed);

    this.activeSource.set(parsed);
    this.sourceOrigin.set('imported');

    return {
      source: parsed,
      validation,
      origin: 'imported',
    };
  }

  resetToDefaultSource(): void {
    this.activeSource.set(DESIGN_SOURCE);
    this.sourceOrigin.set('default');
  }

  updateLotSegmentBearing(segmentIndex: number, bearing: string): void {
    const normalizedBearing = bearing.trim();
    if (!normalizedBearing) {
      return;
    }

    this.activeSource.update((source) => {
      if (segmentIndex < 0 || segmentIndex >= source.settings.lot.segments.length) {
        return source;
      }

      const nextSegments = source.settings.lot.segments.map((segment, index) => (
        index === segmentIndex
          ? { ...segment, bearing: normalizedBearing }
          : { ...segment }
      ));

      return {
        ...source,
        settings: {
          ...source.settings,
          lot: {
            ...source.settings.lot,
            segments: nextSegments,
          },
        },
      };
    });
  }

  updateLotSegmentDistance(segmentIndex: number, value: number): void {
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }

    this.activeSource.update((source) => {
      if (segmentIndex < 0 || segmentIndex >= source.settings.lot.segments.length) {
        return source;
      }

      const nextSegments = source.settings.lot.segments.map((segment, index) => (
        index === segmentIndex
          ? { ...segment, distance: Number(value.toFixed(6)) }
          : { ...segment }
      ));

      return {
        ...source,
        settings: {
          ...source.settings,
          lot: {
            ...source.settings.lot,
            segments: nextSegments,
          },
        },
      };
    });
  }

  updateLotSegmentSetback(segmentIndex: number, value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      return;
    }

    this.activeSource.update((source) => {
      if (segmentIndex < 0 || segmentIndex >= source.settings.lot.segments.length) {
        return source;
      }

      const nextSegments = source.settings.lot.segments.map((segment, index) => (
        index === segmentIndex
          ? { ...segment, setback: Number(value.toFixed(6)) }
          : { ...segment }
      ));

      return {
        ...source,
        settings: {
          ...source.settings,
          lot: {
            ...source.settings.lot,
            segments: nextSegments,
          },
        },
      };
    });
  }

  updateLotSegmentRrow(segmentIndex: number, isRrow: boolean): void {
    this.activeSource.update((source) => {
      if (segmentIndex < 0 || segmentIndex >= source.settings.lot.segments.length) {
        return source;
      }

      const nextSegments = source.settings.lot.segments.map((segment, index) => {
        if (index !== segmentIndex) {
          return { ...segment };
        }

        if (isRrow) {
          return { ...segment, isRrow: true };
        }

        const { isRrow: _removed, ...rest } = segment;
        return { ...rest };
      });

      return {
        ...source,
        settings: {
          ...source.settings,
          lot: {
            ...source.settings.lot,
            segments: nextSegments,
          },
        },
      };
    });
  }

  addLotPoint(afterPointIndex: number): void {
    this.activeSource.update((source) => {
      const segments = source.settings.lot.segments;
      if (segments.length < 2 || afterPointIndex < 0 || afterPointIndex >= segments.length) {
        return source;
      }

      const points = this.buildEditableLotPoints(segments);
      const nextPointIndex = (afterPointIndex + 1) % points.length;
      const currentPoint = points[afterPointIndex];
      const nextPoint = points[nextPointIndex];
      const insertedPoint: NamedGeometryPoint = {
        label: '',
        x: Number((((currentPoint.x + nextPoint.x) / 2)).toFixed(6)),
        y: Number((((currentPoint.y + nextPoint.y) / 2)).toFixed(6)),
      };
      const nextPoints = this.relabelLotPoints([
        ...points.slice(0, afterPointIndex + 1),
        insertedPoint,
        ...points.slice(afterPointIndex + 1),
      ]);
      const segmentMetadata = this.buildSegmentMetadata(segments);
      const insertedMetadata = {
        setback: segmentMetadata[afterPointIndex]?.setback ?? 0,
        isRrow: false,
      };
      const nextMetadata = [
        ...segmentMetadata.slice(0, afterPointIndex + 1),
        insertedMetadata,
        ...segmentMetadata.slice(afterPointIndex + 1),
      ];

      return {
        ...source,
        settings: {
          ...source.settings,
          lot: {
            ...source.settings.lot,
            segments: this.buildSegmentsFromPoints(nextPoints, nextMetadata),
          },
        },
      };
    });
  }

  removeLotPoint(pointIndex: number): void {
    this.activeSource.update((source) => {
      const segments = source.settings.lot.segments;
      if (segments.length <= 3 || pointIndex <= 0 || pointIndex >= segments.length) {
        return source;
      }

      const points = this.buildEditableLotPoints(segments);
      const nextPoints = this.relabelLotPoints(points.filter((_, index) => index !== pointIndex));
      const segmentMetadata = this.buildSegmentMetadata(segments);
      const previousSegmentIndex = (pointIndex - 1 + segmentMetadata.length) % segmentMetadata.length;
      const outgoingSegmentIndex = pointIndex % segmentMetadata.length;
      const mergedMetadata = {
        setback: Math.max(
          segmentMetadata[previousSegmentIndex]?.setback ?? 0,
          segmentMetadata[outgoingSegmentIndex]?.setback ?? 0,
        ),
        isRrow:
          Boolean(segmentMetadata[previousSegmentIndex]?.isRrow)
          || Boolean(segmentMetadata[outgoingSegmentIndex]?.isRrow),
      };
      const nextMetadata = segmentMetadata
        .filter((_, index) => index !== outgoingSegmentIndex)
        .map((metadata, index) => (index === previousSegmentIndex ? mergedMetadata : metadata));

      return {
        ...source,
        settings: {
          ...source.settings,
          lot: {
            ...source.settings.lot,
            segments: this.buildSegmentsFromPoints(nextPoints, nextMetadata),
          },
        },
      };
    });
  }

  updateLotPoint(pointIndex: number, axis: 'x' | 'y', value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    this.activeSource.update((source) => {
      const segments = source.settings.lot.segments;
      if (segments.length < 3 || pointIndex <= 0 || pointIndex >= segments.length) {
        return source;
      }

      const points = this.buildEditableLotPoints(segments);
      const nextPoints = points.map((point) => ({ ...point }));
      nextPoints[pointIndex] = {
        ...nextPoints[pointIndex],
        [axis]: Number(value.toFixed(6)),
      };

      return {
        ...source,
        settings: {
          ...source.settings,
          lot: {
            ...source.settings.lot,
            segments: this.buildSegmentsFromPoints(
              this.relabelLotPoints(nextPoints),
              this.buildSegmentMetadata(segments),
            ),
          },
        },
      };
    });
  }

  updateProgramRoomCount(roomId: string, count: number): void {
    const normalizedCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;

    this.activeSource.update((source) => {
      const nextProgram = { ...source.settings.rooms.program };

      if (normalizedCount <= 0) {
        delete nextProgram[roomId];
      } else {
        nextProgram[roomId] = normalizedCount;
      }

      return {
        ...source,
        settings: {
          ...source.settings,
          rooms: {
            ...source.settings.rooms,
            program: nextProgram,
          },
        },
      };
    });
  }

  addRoomToProgram(roomId: string): void {
    const room = this.getRoomPrototype(roomId);
    if (!room) {
      return;
    }

    this.activeSource.update((source) => ({
      ...source,
      settings: {
        ...source.settings,
        rooms: {
          ...source.settings.rooms,
          program: {
            ...source.settings.rooms.program,
            [roomId]: Math.max(1, source.settings.rooms.program[roomId] ?? 1),
          },
        },
      },
    }));
  }

  removeRoomFromProgram(roomId: string): void {
    this.activeSource.update((source) => {
      const nextProgram = { ...source.settings.rooms.program };
      delete nextProgram[roomId];

      const nextExceptions = this.cloneAdjacencyExceptions(source.settings.adjacency.exceptions);
      delete nextExceptions[roomId];

      Object.entries(nextExceptions).forEach(([fromId, links]) => {
        if (!(roomId in links)) {
          return;
        }

        const nextLinks = { ...links };
        delete nextLinks[roomId];

        if (Object.keys(nextLinks).length === 0) {
          delete nextExceptions[fromId];
          return;
        }

        nextExceptions[fromId] = nextLinks;
      });

      return {
        ...source,
        settings: {
          ...source.settings,
          rooms: {
            ...source.settings.rooms,
            program: nextProgram,
          },
          adjacency: {
            ...source.settings.adjacency,
            exceptions: nextExceptions,
          },
        },
      };
    });
  }

  updateAdjacencyScore(leftRoomId: string, rightRoomId: string, score: number): void {
    if (leftRoomId === rightRoomId) {
      return;
    }

    const normalizedScore = Math.min(5, Math.max(1, Math.floor(score)));

    this.activeSource.update((source) => {
      const nextExceptions = this.cloneAdjacencyExceptions(source.settings.adjacency.exceptions);

      this.writeAdjacencyScore(nextExceptions, leftRoomId, rightRoomId, normalizedScore, source.settings.adjacency.defaultScore);
      this.writeAdjacencyScore(nextExceptions, rightRoomId, leftRoomId, normalizedScore, source.settings.adjacency.defaultScore);

      return {
        ...source,
        settings: {
          ...source.settings,
          adjacency: {
            ...source.settings.adjacency,
            exceptions: nextExceptions,
          },
        },
      };
    });
  }

  exportActiveSourceJson(): string {
    return JSON.stringify(this.activeSource(), null, 2);
  }

  getDefaultSourceSnapshot(): SourceReadSnapshot {
    return {
      source: DESIGN_SOURCE,
      validation: DESIGN_SOURCE_VALIDATION,
      origin: 'default',
    };
  }

  private getRoomPrototype(roomId: string): RoomPrototype | undefined {
    return this.activeSource().roomCatalog.find((room) => room.id === roomId);
  }

  private cloneAdjacencyExceptions(
    exceptions: Record<string, Record<string, number>>,
  ): Record<string, Record<string, number>> {
    return Object.fromEntries(
      Object.entries(exceptions).map(([fromId, links]) => [fromId, { ...links }]),
    );
  }

  private writeAdjacencyScore(
    exceptions: Record<string, Record<string, number>>,
    fromId: string,
    toId: string,
    score: number,
    defaultScore: number,
  ): void {
    if (score === defaultScore) {
      if (!(fromId in exceptions)) {
        return;
      }

      const nextLinks = { ...exceptions[fromId] };
      delete nextLinks[toId];

      if (Object.keys(nextLinks).length === 0) {
        delete exceptions[fromId];
        return;
      }

      exceptions[fromId] = nextLinks;
      return;
    }

    exceptions[fromId] = {
      ...(exceptions[fromId] ?? {}),
      [toId]: score,
    };
  }

  private buildEditableLotPoints(
    segments: readonly { point: string; bearing: string; distance: number }[],
  ): NamedGeometryPoint[] {
    const points: NamedGeometryPoint[] = [{ label: segments[0]?.point ?? 'P1', x: 0, y: 0 }];
    let currentX = 0;
    let currentY = 0;

    segments.forEach((segment, index) => {
      const bearingRadians = this.parseBearingToRadians(segment.bearing);
      currentX += Math.sin(bearingRadians) * segment.distance;
      currentY += Math.cos(bearingRadians) * segment.distance;
      points.push({
        label: segments[index + 1]?.point ?? segment.point,
        x: Number(currentX.toFixed(6)),
        y: Number(currentY.toFixed(6)),
      });
    });

    return this.relabelLotPoints(points.slice(0, -1));
  }

  private buildSegmentsFromPoints(
    points: readonly NamedGeometryPoint[],
    segmentMetadata: readonly { setback: number; isRrow?: boolean }[],
  ): ProjectLotSegment[] {
    return points.map((point, index) => {
      const nextPoint = points[(index + 1) % points.length];
      const dx = nextPoint.x - point.x;
      const dy = nextPoint.y - point.y;
      const distance = Math.hypot(dx, dy);

      return {
        point: this.buildPointLabel(index),
        bearing: this.formatBearingFromDelta(dx, dy),
        distance: Number(distance.toFixed(6)),
        setback: segmentMetadata[index]?.setback ?? 0,
        ...(segmentMetadata[index]?.isRrow ? { isRrow: true } : {}),
      };
    });
  }

  private relabelLotPoints(points: readonly NamedGeometryPoint[]): NamedGeometryPoint[] {
    return points.map((point, index) => ({
      ...point,
      label: this.buildPointLabel(index),
    }));
  }

  private buildSegmentMetadata(
    segments: readonly { setback: number; isRrow?: boolean }[],
  ): Array<{ setback: number; isRrow?: boolean }> {
    return segments.map((segment) => ({
      setback: segment.setback,
      ...(segment.isRrow ? { isRrow: true } : {}),
    }));
  }

  private buildPointLabel(index: number): string {
    return `P${index + 1}`;
  }

  private parseBearingToRadians(bearing: string): number {
    const normalizedBearing = bearing
      .replace(/Ãƒâ€šÃ‚Â°|Ã‚Â°|Â°/g, '\u00B0')
      .trim();
    const match = normalizedBearing.match(/^([NS])\s*(\d+)(?:\u00B0|\s)\s*(\d+)(?:'|\s)?\s*([EW])$/i);

    if (!match) {
      throw new Error(`Invalid bearing format: ${bearing}`);
    }

    const [, northSouth, degreeText, minuteText, eastWest] = match;
    const degrees = Number(degreeText);
    const minutes = Number(minuteText);
    const angle = degrees + minutes / 60;
    const angleRadians = (angle * Math.PI) / 180;

    if (northSouth.toUpperCase() === 'N' && eastWest.toUpperCase() === 'E') {
      return angleRadians;
    }
    if (northSouth.toUpperCase() === 'N' && eastWest.toUpperCase() === 'W') {
      return -angleRadians;
    }
    if (northSouth.toUpperCase() === 'S' && eastWest.toUpperCase() === 'E') {
      return Math.PI - angleRadians;
    }
    return Math.PI + angleRadians;
  }

  private formatBearingFromDelta(dx: number, dy: number): string {
    const azimuth = (Math.atan2(dx, dy) + 2 * Math.PI) % (2 * Math.PI);
    const quadrant = this.resolveBearingQuadrant(azimuth);
    const totalDegrees = quadrant.angleRadians * (180 / Math.PI);
    let degrees = Math.floor(totalDegrees);
    let minutes = Math.round((totalDegrees - degrees) * 60);

    if (minutes === 60) {
      degrees += 1;
      minutes = 0;
    }

    return `${quadrant.northSouth} ${degrees}\u00B0 ${String(minutes).padStart(2, '0')}' ${quadrant.eastWest}`;
  }

  private resolveBearingQuadrant(azimuth: number): {
    northSouth: 'N' | 'S';
    eastWest: 'E' | 'W';
    angleRadians: number;
  } {
    if (azimuth <= Math.PI / 2) {
      return { northSouth: 'N', eastWest: 'E', angleRadians: azimuth };
    }
    if (azimuth <= Math.PI) {
      return { northSouth: 'S', eastWest: 'E', angleRadians: Math.PI - azimuth };
    }
    if (azimuth <= (3 * Math.PI) / 2) {
      return { northSouth: 'S', eastWest: 'W', angleRadians: azimuth - Math.PI };
    }

    return { northSouth: 'N', eastWest: 'W', angleRadians: 2 * Math.PI - azimuth };
  }
}
