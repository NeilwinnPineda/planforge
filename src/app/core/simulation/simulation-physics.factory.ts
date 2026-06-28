import type { GeometryBounds, LotGeometryResult } from '../geometry/geometry.exports';
import type { DeterministicCandidateLayout, CandidateSeedPoint, ActiveRoomInstance } from '../generation/generation.exports';
import type { ProjectSettings } from '../source/source.exports';
import type { SimulationBubbleState, SimulationJobState } from './models/simulation-runner.model';
import { type SpawnHeatmap, sampleSpawnHeatmap } from './spawn-heatmap.factory';

interface SimulationForceSettings {
  damping: number;
  maxSpeed: number;
  initialRoomClearance: number;
  roomInertiaReferenceArea: number;
  roomInertiaMinArea: number;
  roomInertiaMinScale: number;
  roomInertiaMaxScale: number;
  globalCollisionClearance: number;
  globalCollisionPush: number;
  boundaryFallbackStep: number;
  boundaryAxisBounceDamping: number;
  boundaryBounceDamping: number;
  frontEdgeAttractionModifier: number;
  baseAttractionForce: number;
  fillerEdgeAttractionForce: number;
  vistaEdgeAttractionForce: number;
}

// Slice 6 / Real simulation behavior block.
// Stage category: generation.
// Input: deterministic candidate seeds, canonical lot geometry, and source simulation settings.
// Output: initial placed simulation bubbles and per-tick physics updates.
// Allowed dependencies: seed-stage outputs, lot geometry, and source simulation settings only.
// Forbidden responsibilities: SAT scoring, candidate capture acceptance, and view projection.
export function buildInitialSimulationBubbles(
  roomInstances: ActiveRoomInstance[],
  candidateLayout: DeterministicCandidateLayout,
  lotGeometry: LotGeometryResult,
  sourceSettings: ProjectSettings,
  jobIndex: number,
  respawnSeed: number,
  heatmap?: SpawnHeatmap | null,
): SimulationBubbleState[] {
  const polygon = lotGeometry.buildablePoints.map((point) => ({ x: point.x, y: point.y }));
  const polygonCenter = getPolygonCenter(polygon);
  const candidates = shuffleDeterministically(
    buildPlacementCandidates(polygonCenter, lotGeometry.buildableBounds),
    jobIndex + respawnSeed,
  );
  const forceSettings = getSimulationForceSettings(sourceSettings);
  const placed: SimulationBubbleState[] = [];
  const orderedSeeds = [...candidateLayout.seeds]
    .map((seed) => ({
      seed,
      seedOrder: seed.biasProfile.weight <= 0
        ? deterministicOffset(respawnSeed, seed.instanceId.length + seed.label.length, 1000)
        : 0,
    }))
    .sort((left, right) =>
      right.seed.biasProfile.weight - left.seed.biasProfile.weight
      || right.seed.radiusMeters - left.seed.radiusMeters
      || left.seedOrder - right.seedOrder,
    );
  const roomInstanceById = new Map(roomInstances.map((roomInstance) => [roomInstance.instanceId, roomInstance] as const));

  orderedSeeds
    .forEach(({ seed }, index) => {
      const roomInstance = roomInstanceById.get(seed.instanceId);
      if (!roomInstance) {
        return;
      }

      const biasedCandidates = getBiasedCandidates(seed, candidates, lotGeometry, respawnSeed + index * 97, heatmap);
      const matchedCandidate = biasedCandidates.find((candidate) =>
        circleFitsInsidePolygon(candidate.x, candidate.y, seed.radiusMeters, polygon)
        && placed.every((existingBubble) =>
          Math.hypot(candidate.x - existingBubble.x, candidate.y - existingBubble.y)
            >= seed.radiusMeters + existingBubble.radiusMeters + forceSettings.initialRoomClearance,
        ),
      );
      const fallbackCandidate =
        biasedCandidates.find((candidate) => circleFitsInsidePolygon(candidate.x, candidate.y, seed.radiusMeters, polygon))
        ?? polygonCenter;
      const selectedCandidate = matchedCandidate ?? fallbackCandidate;

      placed.push({
        instanceId: seed.instanceId,
        typeId: roomInstance.typeId,
        label: seed.label,
        color: seed.color,
        radiusMeters: seed.radiusMeters,
        targetAreaSquareMeters: seed.targetAreaSquareMeters,
        band: seed.band,
        tags: [...roomInstance.tags],
        pkg: false,
        hallway: false,
        vx: Number(deterministicOffset(jobIndex + respawnSeed + 2, index + 1, 0.05).toFixed(4)),
        vy: Number(deterministicOffset(jobIndex + respawnSeed + 5, index + 1, 0.05).toFixed(4)),
        x: Number(selectedCandidate.x.toFixed(3)),
        y: Number(selectedCandidate.y.toFixed(3)),
        placed: matchedCandidate !== undefined || selectedCandidate === fallbackCandidate,
      });
    });

  const fillerPlacements = createBuildableFillers(
    polygon,
    placed,
    lotGeometry.buildableBounds,
    sourceSettings,
    jobIndex + respawnSeed,
  );
  return [...placed, ...fillerPlacements];
}

export function stepSimulationJob(
  job: SimulationJobState,
  lotGeometry: LotGeometryResult,
  sourceSettings: ProjectSettings,
): SimulationJobState {
  const polygon = lotGeometry.buildablePoints.map((point) => ({ x: point.x, y: point.y }));
  const polygonCenter = getPolygonCenter(polygon);
  const bounds = lotGeometry.buildableBounds;
  const forceSettings = getSimulationForceSettings(sourceSettings);
  const nextBubbles = job.bubbles.map((bubble) => ({ ...bubble }));

  applyCollisionPush(nextBubbles, polygonCenter, forceSettings);
  applyMatrixForces(nextBubbles, sourceSettings);
  applyHallwaySleepingForce(nextBubbles, sourceSettings, forceSettings);
  applyFrontagePull(nextBubbles, lotGeometry, polygonCenter, forceSettings);
  applyFillerEdgePull(nextBubbles, polygon, polygonCenter, forceSettings);
  applyVistaEdgePull(nextBubbles, polygon, polygonCenter, forceSettings);

  nextBubbles.forEach((bubble, index) => {
    if (!bubble.placed) {
      return;
    }

    bubble.vx += deterministicOffset(index + 1, job.tickCount + 1, 0.0012);
    bubble.vy += deterministicOffset(index + 3, job.tickCount + 1, 0.0012);
    bubble.vx *= forceSettings.damping;
    bubble.vy *= forceSettings.damping;
    limitBubbleSpeed(bubble, forceSettings.maxSpeed);

    const trialX = bubble.x + bubble.vx;
    const trialY = bubble.y + bubble.vy;
    if (circleFitsInsidePolygon(trialX, trialY, bubble.radiusMeters, polygon)) {
      bubble.x = Number(trialX.toFixed(3));
      bubble.y = Number(trialY.toFixed(3));
      return;
    }

    const xOnly = bubble.x + bubble.vx;
    if (circleFitsInsidePolygon(xOnly, bubble.y, bubble.radiusMeters, polygon)) {
      bubble.x = Number(xOnly.toFixed(3));
      bubble.vy *= -forceSettings.boundaryAxisBounceDamping;
      return;
    }

    const yOnly = bubble.y + bubble.vy;
    if (circleFitsInsidePolygon(bubble.x, yOnly, bubble.radiusMeters, polygon)) {
      bubble.y = Number(yOnly.toFixed(3));
      bubble.vx *= -forceSettings.boundaryAxisBounceDamping;
      return;
    }

    const towardCenter = normalizedDirection(
      polygonCenter.x - bubble.x,
      polygonCenter.y - bubble.y,
      index * 17 + job.index * 31,
    );
    const fallbackX = bubble.x + towardCenter.nx * forceSettings.boundaryFallbackStep;
    const fallbackY = bubble.y + towardCenter.ny * forceSettings.boundaryFallbackStep;
    if (circleFitsInsidePolygon(fallbackX, fallbackY, bubble.radiusMeters, polygon)) {
      bubble.x = Number(fallbackX.toFixed(3));
      bubble.y = Number(fallbackY.toFixed(3));
    }

    bubble.vx *= -forceSettings.boundaryBounceDamping;
    bubble.vy *= -forceSettings.boundaryBounceDamping;
  });

  return {
    ...job,
    tickCount: job.tickCount + 1,
    bubbles: nextBubbles,
  };
}

export function applySimulationShakeImpulse(
  job: SimulationJobState,
  sourceSettings: ProjectSettings,
): SimulationJobState {
  const nextBubbles = job.bubbles.map((bubble, index) => {
    if (!bubble.placed) {
      return bubble;
    }

    const angle = ((job.index + 1) * 0.73) + ((index + 1) * 1.19);
    const magnitudeBase = bubble.pkg
      ? sourceSettings.simulation.forces.shakePkgMagnitude
      : sourceSettings.simulation.forces.shakeRoomMagnitude;
    const magnitude =
      magnitudeBase * (sourceSettings.simulation.forces.shakeMagnitudeRandom + 0.5 + Math.abs(Math.sin(angle)));
    const sideKick =
      (index + 1) % 5 === 0 ? sourceSettings.simulation.forces.shakeEveryFifthSideKick : 0;

    return {
      ...bubble,
      vx: Number((bubble.vx + Math.cos(angle) * magnitude + Math.cos(angle + Math.PI / 2) * sideKick).toFixed(4)),
      vy: Number((bubble.vy + Math.sin(angle) * magnitude + Math.sin(angle + Math.PI / 2) * sideKick).toFixed(4)),
    };
  });

  return {
    ...job,
    shakeCount: job.shakeCount + 1,
    bubbles: nextBubbles,
  };
}

function getSimulationForceSettings(sourceSettings: ProjectSettings): SimulationForceSettings {
  return {
    damping: sourceSettings.simulation.forces.damping,
    maxSpeed: sourceSettings.simulation.forces.maxSpeed,
    initialRoomClearance: sourceSettings.simulation.forces.initialRoomClearance,
    roomInertiaReferenceArea: sourceSettings.simulation.forces.roomInertiaReferenceArea,
    roomInertiaMinArea: sourceSettings.simulation.forces.roomInertiaMinArea,
    roomInertiaMinScale: sourceSettings.simulation.forces.roomInertiaMinScale,
    roomInertiaMaxScale: sourceSettings.simulation.forces.roomInertiaMaxScale,
    globalCollisionClearance: sourceSettings.simulation.forces.globalCollisionClearance,
    globalCollisionPush: sourceSettings.simulation.forces.globalCollisionPush,
    boundaryFallbackStep: sourceSettings.simulation.forces.boundaryFallbackStep,
    boundaryAxisBounceDamping: sourceSettings.simulation.forces.boundaryAxisBounceDamping,
    boundaryBounceDamping: sourceSettings.simulation.forces.boundaryBounceDamping,
    frontEdgeAttractionModifier: sourceSettings.simulation.forces.frontEdgeAttractionModifier,
    baseAttractionForce: sourceSettings.simulation.forces.baseAttractionForce,
    fillerEdgeAttractionForce: sourceSettings.simulation.forces.fillerEdgeAttractionForce,
    vistaEdgeAttractionForce: sourceSettings.simulation.forces.vistaEdgeAttractionForce,
  };
}

function createBuildableFillers(
  polygon: Array<{ x: number; y: number }>,
  occupied: SimulationBubbleState[],
  bounds: GeometryBounds,
  sourceSettings: ProjectSettings,
  jobIndex: number,
): SimulationBubbleState[] {
  const usedArea = occupied
    .filter((bubble) => bubble.placed && !bubble.pkg && !bubble.hallway)
    .reduce((total, bubble) => total + bubble.targetAreaSquareMeters, 0);
  const buildableArea = polygonArea(polygon);
  const remainingArea =
    Math.max(0, buildableArea - usedArea)
    * (sourceSettings.simulation.forces.fillerAreaShare + sourceSettings.simulation.forces.hallwayAreaShare);
  const fillerAreas = buildCounterSquarePieces(
    remainingArea,
    sourceSettings.simulation.forces.fillerSquarePromoteEvery,
    sourceSettings.simulation.forces.maxSquareFillerSide,
  );
  const polygonCenter = getPolygonCenter(polygon);
  const edgeCandidates = shuffleDeterministically(buildEdgePlacementCandidates(polygon, polygonCenter), jobIndex + 97);

  return fillerAreas.map((areaSquareMeters, index) => {
    const radiusMeters = Math.sqrt(areaSquareMeters / Math.PI);
    const bestSeed = findBestFillerSeed(
      radiusMeters,
      polygon,
      edgeCandidates,
      occupied,
      sourceSettings.simulation.forces.globalCollisionClearance,
    );

    return {
      instanceId: `generated_filler_${index + 1}`,
      typeId: 'generated_filler',
      label: `Filler ${index + 1}`,
      color: sourceSettings.generated.filler.color,
      radiusMeters: Number(radiusMeters.toFixed(3)),
      targetAreaSquareMeters: Number(areaSquareMeters.toFixed(2)),
      band: 'center',
      tags: [],
      pkg: true,
      hallway: false,
      vx: 0,
      vy: 0,
      x: Number(bestSeed.x.toFixed(3)),
      y: Number(bestSeed.y.toFixed(3)),
      placed: bestSeed.placed,
    };
  });
}

function buildPlacementCandidates(
  center: { x: number; y: number },
  bounds: GeometryBounds,
): Array<{ x: number; y: number }> {
  const candidates: Array<{ x: number; y: number }> = [{ x: center.x, y: center.y }];
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  const rings = 18;
  const radialStep = Math.max(0.45, span / 24);

  for (let ring = 1; ring <= rings; ring += 1) {
    const radius = ring * radialStep;
    const steps = 10 + ring * 5;
    for (let step = 0; step < steps; step += 1) {
      const angle = (Math.PI * 2 * step) / steps;
      const x = center.x + Math.cos(angle) * radius;
      const y = center.y + Math.sin(angle) * radius;
      if (x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY) {
        candidates.push({ x, y });
      }
    }
  }

  return candidates;
}

function getBiasedCandidates(
  seed: CandidateSeedPoint,
  candidates: Array<{ x: number; y: number }>,
  lotGeometry: LotGeometryResult,
  respawnSeed: number,
  heatmap?: SpawnHeatmap | null,
): Array<{ x: number; y: number }> {
  if (seed.biasProfile.weight <= 0) {
    return shuffleDeterministically(candidates, respawnSeed + seed.instanceId.length * 31);
  }

  const rrowIndex = lotGeometry.lotSegments.findIndex((segment) => segment.isRrow);
  const polygon = lotGeometry.buildablePoints;
  const frontageEdge =
    rrowIndex >= 0 && polygon.length >= 3
      ? {
        start: polygon[rrowIndex],
        end: polygon[(rrowIndex + 1) % polygon.length],
      }
      : null;
  const center = getPolygonCenter(polygon);
  const bounds = lotGeometry.buildableBounds;
  const width = Math.max(0.001, bounds.maxX - bounds.minX);
  const height = Math.max(0.001, bounds.maxY - bounds.minY);

  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      score: scoreSeedCandidate(
        candidate,
        seed,
        frontageEdge,
        polygon,
        center,
        bounds.minX,
        bounds.minY,
        width,
        height,
        respawnSeed,
        index,
        heatmap,
      ),
    }))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map((entry) => entry.candidate);
}

function scoreSeedCandidate(
  candidate: { x: number; y: number },
  seed: CandidateSeedPoint,
  frontageEdge: { start: { x: number; y: number }; end: { x: number; y: number } } | null,
  polygon: Array<{ x: number; y: number }>,
  center: { x: number; y: number },
  minX: number,
  minY: number,
  width: number,
  height: number,
  respawnSeed: number,
  candidateIndex: number,
  heatmap?: SpawnHeatmap | null,
): number {
  const normalizedX = (candidate.x - minX) / width;
  const normalizedY = (candidate.y - minY) / height;
  const horizontalOffset = Math.abs(normalizedX - seed.biasProfile.horizontalAnchor);
  const verticalOffset = Math.abs(normalizedY - seed.biasProfile.verticalAnchor);
  const centerDistance = Math.hypot(candidate.x - center.x, candidate.y - center.y);
  const nearestEdgeDistance = getNearestPolygonEdgeDistance(candidate.x, candidate.y, polygon);
  const frontageDistance = frontageEdge
    ? distanceToSegment(
      candidate.x,
      candidate.y,
      frontageEdge.start.x,
      frontageEdge.start.y,
      frontageEdge.end.x,
      frontageEdge.end.y,
    )
    : centerDistance;

  let score = (horizontalOffset * 1.2 + verticalOffset * 1.8) * seed.biasProfile.weight;

  if (seed.biasProfile.edgeBias === 'frontage') {
    score += frontageDistance * 0.75;
  } else if (seed.biasProfile.edgeBias === 'perimeter') {
    score += nearestEdgeDistance * 0.55;
    if (frontageEdge && seed.band === 'rear') {
      score -= frontageDistance * 0.18;
    }
  } else {
    score += centerDistance * 0.24;
  }

  const randomJitter = Math.abs(deterministicOffset(respawnSeed + candidateIndex, seed.instanceId.length, 1.4));
  score += randomJitter * (1 - Math.min(1, seed.biasProfile.weight));

  if (heatmap) {
    score -= sampleSpawnHeatmap(heatmap, candidate.x, candidate.y) * 0.25;
  }

  return score;
}

function applyCollisionPush(
  bubbles: SimulationBubbleState[],
  polygonCenter: { x: number; y: number },
  settings: SimulationForceSettings,
): void {
  const maxCentroidDistance = getMaxBubbleCentroidDistance(bubbles, polygonCenter);

  for (let leftIndex = 0; leftIndex < bubbles.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < bubbles.length; rightIndex += 1) {
      const left = bubbles[leftIndex];
      const right = bubbles[rightIndex];
      if (!left.placed || !right.placed) {
        continue;
      }

      const dx = right.x - left.x;
      const dy = right.y - left.y;
      const direction = normalizedDirection(dx, dy, leftIndex * 97 + rightIndex * 31);
      const minimumDistance = left.radiusMeters + right.radiusMeters + settings.globalCollisionClearance;
      const overlap = minimumDistance - direction.dist;

      if (overlap <= 0) {
        continue;
      }

      const overlapRatio = clampUnit(overlap / minimumDistance);
      const collisionCentroid = {
        x: (left.x + right.x) / 2,
        y: (left.y + right.y) / 2,
      };
      const centroidAmplifier = getCentroidPushAmplifier(
        collisionCentroid,
        polygonCenter,
        maxCentroidDistance,
      );
      const penetrationPush = getPenetrationPush(
        overlap,
        overlapRatio,
        settings.globalCollisionPush,
        centroidAmplifier,
      );
      const leftShare = getCollisionResponseShare(left, right, settings);
      const rightShare = 1 - leftShare;

      left.vx -= direction.nx * penetrationPush * leftShare;
      left.vy -= direction.ny * penetrationPush * leftShare;
      right.vx += direction.nx * penetrationPush * rightShare;
      right.vy += direction.ny * penetrationPush * rightShare;
    }
  }
}

function applyMatrixForces(
  bubbles: SimulationBubbleState[],
  sourceSettings: ProjectSettings,
): void {
  const forceSettings = getSimulationForceSettings(sourceSettings);
  const placed = bubbles.filter((bubble) => bubble.placed);

  for (let leftIndex = 0; leftIndex < placed.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < placed.length; rightIndex += 1) {
      const left = placed[leftIndex];
      const right = placed[rightIndex];
      const score = getAdjacencyScore(left, right, sourceSettings);
      const direction = normalizedDirection(
        right.x - left.x,
        right.y - left.y,
        leftIndex * 17 + rightIndex * 31,
      );

      if (score >= 4) {
        const target =
          left.radiusMeters
          + right.radiusMeters
          + getAttractionGapTarget(score, sourceSettings.simulation.forces.pullLinkGap);
        if (direction.dist <= target) {
          continue;
        }

        const pull = (direction.dist - target)
          * sourceSettings.simulation.forces.baseAttractionForce
          * getAttractionScoreMultiplier(score);
        applyBubbleImpulse(left, direction.nx * pull, direction.ny * pull, forceSettings);
        applyBubbleImpulse(right, -direction.nx * pull, -direction.ny * pull, forceSettings);
        continue;
      }

      if (score <= 2) {
        const gapTarget = getRepulsionGapTarget(score, left, right);
        const comfort = left.radiusMeters + right.radiusMeters + gapTarget;
        if (direction.dist >= comfort) {
          continue;
        }

        const push = (comfort - direction.dist)
          * sourceSettings.simulation.forces.baseRepulsionForce
          * getRepulsionScoreMultiplier(score);
        applyBubbleImpulse(left, -direction.nx * push, -direction.ny * push, forceSettings);
        applyBubbleImpulse(right, direction.nx * push, direction.ny * push, forceSettings);
      }
    }
  }
}

function applyHallwaySleepingForce(
  bubbles: SimulationBubbleState[],
  sourceSettings: ProjectSettings,
  forceSettings: SimulationForceSettings,
): void {
  const hallways = bubbles.filter((bubble) => bubble.placed && bubble.hallway);
  const sleeping = bubbles.filter((bubble) => bubble.placed && bubble.tags.includes('sleeping'));

  hallways.forEach((hallway, hallwayIndex) => {
    sleeping.forEach((sleepingBubble, sleepingIndex) => {
      const direction = normalizedDirection(
        sleepingBubble.x - hallway.x,
        sleepingBubble.y - hallway.y,
        hallwayIndex * 17 + sleepingIndex * 31,
      );
      const target = hallway.radiusMeters + sleepingBubble.radiusMeters + sourceSettings.simulation.forces.pullLinkGap;
      if (direction.dist <= target) {
        return;
      }

      const pull = (direction.dist - target) * forceSettings.baseAttractionForce * 1.5;
      applyBubbleImpulse(hallway, direction.nx * pull, direction.ny * pull, forceSettings);
      applyBubbleImpulse(sleepingBubble, -direction.nx * pull, -direction.ny * pull, forceSettings);
    });
  });
}

function applyFrontagePull(
  bubbles: SimulationBubbleState[],
  lotGeometry: LotGeometryResult,
  polygonCenter: { x: number; y: number },
  settings: SimulationForceSettings,
): void {
  const rrowIndex = lotGeometry.lotSegments.findIndex((segment) => segment.isRrow);
  const polygon = lotGeometry.buildablePoints;
  if (rrowIndex < 0 || polygon.length < 3) {
    return;
  }

  const edgeStart = polygon[rrowIndex];
  const edgeEnd = polygon[(rrowIndex + 1) % polygon.length];
  const edgeDx = edgeEnd.x - edgeStart.x;
  const edgeDy = edgeEnd.y - edgeStart.y;
  const edgeLength = Math.hypot(edgeDx, edgeDy) || 0.0001;
  const midpoint = {
    x: (edgeStart.x + edgeEnd.x) / 2,
    y: (edgeStart.y + edgeEnd.y) / 2,
  };
  const normal = { x: -edgeDy / edgeLength, y: edgeDx / edgeLength };
  const inward =
    (polygonCenter.x - midpoint.x) * normal.x + (polygonCenter.y - midpoint.y) * normal.y >= 0
      ? normal
      : { x: -normal.x, y: -normal.y };

  bubbles.forEach((bubble, index) => {
    if (!bubble.placed) {
      return;
    }

    const isFrontFacing = bubble.tags.includes('front_facing');
    if (!isFrontFacing) {
      return;
    }

    const target = {
      x: midpoint.x + inward.x * bubble.radiusMeters,
      y: midpoint.y + inward.y * bubble.radiusMeters,
    };
    const direction = normalizedDirection(target.x - bubble.x, target.y - bubble.y, index * 41);
    const modifierScale = bubble.typeId === 'foyer' ? 1.15 : bubble.typeId === 'garage' ? 1.3 : 1;
    const pull = direction.dist * settings.baseAttractionForce * settings.frontEdgeAttractionModifier * modifierScale;
    applyBubbleImpulse(bubble, direction.nx * pull, direction.ny * pull, settings);
  });
}

function applyFillerEdgePull(
  bubbles: SimulationBubbleState[],
  polygon: Array<{ x: number; y: number }>,
  polygonCenter: { x: number; y: number },
  settings: SimulationForceSettings,
): void {
  bubbles.forEach((bubble, index) => {
    if (!bubble.placed || !bubble.pkg) {
      return;
    }

    const target = getNearestInsetEdgePoint(bubble, polygon, polygonCenter, settings.globalCollisionClearance);
    if (!target) {
      return;
    }

    const direction = normalizedDirection(target.x - bubble.x, target.y - bubble.y, index * 59);
    const pull = direction.dist * settings.fillerEdgeAttractionForce;
    applyBubbleImpulse(bubble, direction.nx * pull, direction.ny * pull, settings);
  });
}

function applyVistaEdgePull(
  bubbles: SimulationBubbleState[],
  polygon: Array<{ x: number; y: number }>,
  polygonCenter: { x: number; y: number },
  settings: SimulationForceSettings,
): void {
  bubbles.forEach((bubble, index) => {
    if (!bubble.placed || bubble.pkg || bubble.hallway || !bubble.tags.includes('vista')) {
      return;
    }

    const target = getNearestInsetEdgePoint(bubble, polygon, polygonCenter, settings.globalCollisionClearance);
    if (!target) {
      return;
    }

    const direction = normalizedDirection(target.x - bubble.x, target.y - bubble.y, index * 71);
    const pull = direction.dist * settings.vistaEdgeAttractionForce;
    applyBubbleImpulse(bubble, direction.nx * pull, direction.ny * pull, settings);
  });
}

function normalizedDirection(
  dx: number,
  dy: number,
  salt: number,
): { nx: number; ny: number; dist: number } {
  const dist = Math.hypot(dx, dy);
  if (dist > 1e-6) {
    return { nx: dx / dist, ny: dy / dist, dist };
  }

  const angle = ((salt % 360) * Math.PI) / 180;
  return { nx: Math.cos(angle), ny: Math.sin(angle), dist: 0.0001 };
}

function limitBubbleSpeed(bubble: SimulationBubbleState, maxSpeed: number): void {
  const speed = Math.hypot(bubble.vx, bubble.vy);
  if (speed <= maxSpeed || speed <= 1e-6) {
    return;
  }

  const scale = maxSpeed / speed;
  bubble.vx *= scale;
  bubble.vy *= scale;
}

function getCollisionResponseShare(
  bubble: SimulationBubbleState,
  otherBubble: SimulationBubbleState,
  settings: SimulationForceSettings,
): number {
  const bubbleInertia = getBubbleInertiaScale(bubble, settings);
  const otherInertia = getBubbleInertiaScale(otherBubble, settings);
  const totalInertia = bubbleInertia + otherInertia;

  if (totalInertia <= 1e-6) {
    return 0.5;
  }

  return otherInertia / totalInertia;
}

function getBubbleInertiaScale(
  bubble: SimulationBubbleState,
  settings: SimulationForceSettings,
): number {
  const bubbleArea = Math.PI * bubble.radiusMeters * bubble.radiusMeters;
  const effectiveArea = Math.max(settings.roomInertiaMinArea, bubbleArea);
  const normalizedArea = effectiveArea / Math.max(0.001, settings.roomInertiaReferenceArea);
  return clampRange(
    normalizedArea,
    settings.roomInertiaMinScale,
    settings.roomInertiaMaxScale,
  );
}

function applyBubbleImpulse(
  bubble: SimulationBubbleState,
  impulseX: number,
  impulseY: number,
  settings: SimulationForceSettings,
): void {
  const inertiaScale = getBubbleInertiaScale(bubble, settings);
  bubble.vx += impulseX / Math.max(0.001, inertiaScale);
  bubble.vy += impulseY / Math.max(0.001, inertiaScale);
}

function smoothCollisionResponse(overlapRatio: number): number {
  const clampedRatio = clampUnit(overlapRatio);
  return 0.18 + 0.82 * clampedRatio * clampedRatio;
}

function getPenetrationPush(
  overlap: number,
  overlapRatio: number,
  globalCollisionPush: number,
  centroidAmplifier: number,
): number {
  const softenedOverlap = smoothCollisionResponse(overlapRatio) * overlap;
  const penetrationBoost = 1 + overlapRatio * overlapRatio * 2.4;
  return softenedOverlap * globalCollisionPush * penetrationBoost * centroidAmplifier;
}

function getCentroidPushAmplifier(
  collisionCentroid: { x: number; y: number },
  polygonCenter: { x: number; y: number },
  maxCentroidDistance: number,
): number {
  const distanceToCentroid = Math.hypot(
    collisionCentroid.x - polygonCenter.x,
    collisionCentroid.y - polygonCenter.y,
  );
  const normalizedDistance = maxCentroidDistance <= 1e-6 ? 0 : clampUnit(distanceToCentroid / maxCentroidDistance);
  const centroidCloseness = 1 - normalizedDistance;

  // Central congestion gets the strongest absolute push so radius preservation
  // dominates even over the highest ordinary repel relationship.
  return 1 + centroidCloseness * 4.5;
}

function getMaxBubbleCentroidDistance(
  bubbles: SimulationBubbleState[],
  polygonCenter: { x: number; y: number },
): number {
  let maxDistance = 0;

  bubbles.forEach((bubble) => {
    if (!bubble.placed) {
      return;
    }

    maxDistance = Math.max(
      maxDistance,
      Math.hypot(bubble.x - polygonCenter.x, bubble.y - polygonCenter.y),
    );
  });

  return maxDistance;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function circleFitsInsidePolygon(
  x: number,
  y: number,
  radiusMeters: number,
  polygon: Array<{ x: number; y: number }>,
): boolean {
  if (!pointInPolygon(x, y, polygon)) {
    return false;
  }

  for (let index = 0; index < 16; index += 1) {
    const angle = (Math.PI * 2 * index) / 16;
    const sampleX = x + Math.cos(angle) * radiusMeters;
    const sampleY = y + Math.sin(angle) * radiusMeters;
    if (!pointInPolygon(sampleX, sampleY, polygon)) {
      return false;
    }
  }

  return true;
}

function pointInPolygon(
  x: number,
  y: number,
  polygon: Array<{ x: number; y: number }>,
): boolean {
  let inside = false;

  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index++) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const intersects =
      ((current.y > y) !== (previous.y > y))
      && x < ((previous.x - current.x) * (y - current.y)) / ((previous.y - current.y) || 1e-9) + current.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-9) {
    return Math.hypot(px - ax, py - ay);
  }

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function getNearestPolygonEdgeDistance(
  x: number,
  y: number,
  polygon: Array<{ x: number; y: number }>,
): number {
  let nearestDistance = Number.POSITIVE_INFINITY;

  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    nearestDistance = Math.min(
      nearestDistance,
      distanceToSegment(x, y, point.x, point.y, next.x, next.y),
    );
  });

  return nearestDistance;
}

function getPolygonCenter(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  if (!points.length) {
    return { x: 0, y: 0 };
  }

  const totals = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: totals.x / points.length,
    y: totals.y / points.length,
  };
}

function deterministicOffset(seedA: number, seedB: number, magnitude: number): number {
  const raw = Math.sin((seedA + 1) * 11.17 + (seedB + 1) * 7.31);
  return raw * magnitude;
}

function shuffleDeterministically<T>(items: T[], seed: number): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.abs(Math.floor(Math.sin((seed + 1) * (index + 3)) * 100000)) % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function getAdjacencyScore(
  left: SimulationBubbleState,
  right: SimulationBubbleState,
  sourceSettings: ProjectSettings,
): number {
  if (left.hallway && right.hallway) {
    return 4;
  }

  const leftKey = left.pkg ? 'generated_filler' : left.hallway ? 'generated_hallway' : left.typeId;
  const rightKey = right.pkg ? 'generated_filler' : right.hallway ? 'generated_hallway' : right.typeId;

  if (leftKey === rightKey && leftKey.startsWith('generated_')) {
    return sourceSettings.adjacency.generatedTypeDefaults[leftKey]
      ?? sourceSettings.adjacency.sameTypeDefault;
  }

  return sourceSettings.adjacency.exceptions[leftKey]?.[rightKey]
    ?? sourceSettings.adjacency.exceptions[rightKey]?.[leftKey]
    ?? (leftKey === rightKey ? sourceSettings.adjacency.sameTypeDefault : sourceSettings.adjacency.defaultScore);
}

function getAttractionScoreMultiplier(score: number): number {
  if (score === 6) {
    return 4;
  }

  if (score === 5) {
    return 2;
  }

  return 1;
}

function getRepulsionScoreMultiplier(score: number): number {
  return score === 1 ? 3 : 1;
}

function getAttractionGapTarget(score: number, basePullLinkGap: number): number {
  if (score === 6) {
    return basePullLinkGap - 0.2;
  }

  if (score === 5) {
    return basePullLinkGap + 0.1;
  }

  return basePullLinkGap + 0.45;
}

function getRepulsionGapTarget(
  score: number,
  left: SimulationBubbleState,
  right: SimulationBubbleState,
): number {
  const combinedRadius = left.radiusMeters + right.radiusMeters;

  if (score === 1) {
    return combinedRadius * 0.5;
  }

  return combinedRadius * 0.2;
}

function polygonArea(points: Array<{ x: number; y: number }>): number {
  if (points.length < 3) {
    return 0;
  }

  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    total += current.x * next.y - next.x * current.y;
  }

  return Math.abs(total) / 2;
}

function buildCounterSquarePieces(
  areaSquareMeters: number,
  promoteEvery: number,
  maxSquareSide: number,
): number[] {
  const targetArea = Math.floor(Math.max(0, areaSquareMeters));
  const counts = new Map<number, number>();

  for (let side = 1; side <= maxSquareSide; side += 1) {
    counts.set(side, 0);
  }

  let usedArea = 0;
  while (usedArea < targetArea) {
    counts.set(1, (counts.get(1) ?? 0) + 1);
    usedArea += 1;
    for (let side = 1; side < maxSquareSide; side += 1) {
      while ((counts.get(side) ?? 0) >= promoteEvery) {
        counts.set(side, (counts.get(side) ?? 0) - promoteEvery);
        counts.set(side + 1, (counts.get(side + 1) ?? 0) + 1);
      }
    }
  }

  const pieces: number[] = [];
  counts.forEach((count, side) => {
    for (let index = 0; index < count; index += 1) {
      pieces.push(side * side);
    }
  });

  return pieces.filter((piece) => piece > 0);
}

function buildEdgePlacementCandidates(
  polygon: Array<{ x: number; y: number }>,
  polygonCenter: { x: number; y: number },
): Array<{ x: number; y: number }> {
  const candidates: Array<{ x: number; y: number }> = [];

  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    const edgeDx = next.x - point.x;
    const edgeDy = next.y - point.y;
    const edgeLength = Math.hypot(edgeDx, edgeDy) || 0.0001;
    const normal = { x: -edgeDy / edgeLength, y: edgeDx / edgeLength };
    const midpoint = {
      x: (point.x + next.x) / 2,
      y: (point.y + next.y) / 2,
    };
    const inward =
      (polygonCenter.x - midpoint.x) * normal.x + (polygonCenter.y - midpoint.y) * normal.y >= 0
        ? normal
        : { x: -normal.x, y: -normal.y };

    for (let step = 1; step <= 8; step += 1) {
      const t = step / 9;
      const edgePoint = {
        x: point.x + edgeDx * t,
        y: point.y + edgeDy * t,
      };
      for (let depth = 1; depth <= 8; depth += 1) {
        const inset = 0.25 * depth;
        candidates.push({
          x: edgePoint.x + inward.x * inset,
          y: edgePoint.y + inward.y * inset,
        });
      }
    }
  });

  return candidates;
}

function findBestFillerSeed(
  radiusMeters: number,
  polygon: Array<{ x: number; y: number }>,
  candidates: Array<{ x: number; y: number }>,
  existingBubbles: SimulationBubbleState[],
  clearance: number,
): { x: number; y: number; placed: boolean } {
  let bestX = 0;
  let bestY = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  let found = false;

  candidates.forEach((candidate) => {
    if (!circleFitsInsidePolygon(candidate.x, candidate.y, radiusMeters, polygon)) {
      return;
    }

    const overlapScore = existingBubbles.reduce((score, existing) => {
      if (!existing.placed) {
        return score;
      }
      const distance = Math.hypot(candidate.x - existing.x, candidate.y - existing.y) || 0.0001;
      const overlap = Math.max(0, radiusMeters + existing.radiusMeters + clearance - distance);
      return score + overlap * overlap;
    }, 0);

    if (overlapScore < bestScore) {
      bestX = candidate.x;
      bestY = candidate.y;
      bestScore = overlapScore;
      found = true;
    }
  });

  if (found) {
    return { x: bestX, y: bestY, placed: true };
  }

  const center = getPolygonCenter(polygon);
  return { x: center.x, y: center.y, placed: false };
}

function getNearestInsetEdgePoint(
  bubble: SimulationBubbleState,
  polygon: Array<{ x: number; y: number }>,
  polygonCenter: { x: number; y: number },
  clearance: number,
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    const edgeDx = next.x - point.x;
    const edgeDy = next.y - point.y;
    const edgeLengthSq = edgeDx * edgeDx + edgeDy * edgeDy || 0.0001;
    const t = Math.max(0, Math.min(1, ((bubble.x - point.x) * edgeDx + (bubble.y - point.y) * edgeDy) / edgeLengthSq));
    const projected = {
      x: point.x + edgeDx * t,
      y: point.y + edgeDy * t,
    };
    const edgeLength = Math.sqrt(edgeLengthSq);
    const normal = { x: -edgeDy / edgeLength, y: edgeDx / edgeLength };
    const midpoint = {
      x: (point.x + next.x) / 2,
      y: (point.y + next.y) / 2,
    };
    const inward =
      (polygonCenter.x - midpoint.x) * normal.x + (polygonCenter.y - midpoint.y) * normal.y >= 0
        ? normal
        : { x: -normal.x, y: -normal.y };
    const inset = bubble.radiusMeters + clearance;
    const target = {
      x: projected.x + inward.x * inset,
      y: projected.y + inward.y * inset,
    };
    const distance = Math.hypot(target.x - bubble.x, target.y - bubble.y);

    if (distance < bestDistance && circleFitsInsidePolygon(target.x, target.y, bubble.radiusMeters, polygon)) {
      best = target;
      bestDistance = distance;
    }
  });

  return best;
}
