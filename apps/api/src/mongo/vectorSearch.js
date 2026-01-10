export function buildVectorSearchPipeline({
  tripId,
  queryVector,
  limit = 8,
  numCandidates = 200,
  sourceTypes
}) {
  const filter = { tripId, isActive: true };

  if (Array.isArray(sourceTypes) && sourceTypes.length > 0) {
    filter.sourceType = { $in: sourceTypes };
  }

  return [
    {
      $vectorSearch: {
        index: "chunks_vector_index",
        queryVector,
        path: "embedding",
        numCandidates,
        limit,
        filter
      }
    },
    {
      $project: {
        _id: 1,
        text: 1,
        url: 1,
        title: 1,
        score: { $meta: "vectorSearchScore" }
      }
    }
  ];
}
