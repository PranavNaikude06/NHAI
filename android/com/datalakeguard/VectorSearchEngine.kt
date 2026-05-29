package com.datalakeguard

import kotlin.math.sqrt

object VectorSearchEngine {

    // In-memory cache of enrolled embeddings, pre-computed L2 norms, and matching user IDs
    private val enrolledEmbeddings = mutableListOf<FloatArray>()
    private val enrolledNorms = mutableListOf<Float>()
    private val enrolledUserIds = mutableListOf<String>()

    @Synchronized
    fun loadEmbeddings(embeddings: List<FloatArray>, userIds: List<String>) {
        enrolledEmbeddings.clear()
        enrolledNorms.clear()
        enrolledUserIds.clear()

        val limit = Math.min(embeddings.size, userIds.size)
        for (i in 0 until limit) {
            val vector = embeddings[i]
            val userId = userIds[i]
            
            var normSum = 0.0f
            for (v in vector) {
                normSum += v * v
            }
            val norm = if (normSum > 0.0f) sqrt(normSum) else 1.0f

            enrolledEmbeddings.add(vector)
            enrolledNorms.add(norm)
            enrolledUserIds.add(userId)
        }
    }

    @Synchronized
    fun addEmbedding(userId: String, vector: FloatArray) {
        var normSum = 0.0f
        for (v in vector) {
            normSum += v * v
        }
        val norm = if (normSum > 0.0f) sqrt(normSum) else 1.0f

        val idx = enrolledUserIds.indexOf(userId)
        if (idx != -1) {
            enrolledEmbeddings[idx] = vector
            enrolledNorms[idx] = norm
        } else {
            enrolledEmbeddings.add(vector)
            enrolledNorms.add(norm)
            enrolledUserIds.add(userId)
        }
    }

    @Synchronized
    fun findBestMatch(query: FloatArray): MatchResult {
        val size = query.size
        var queryNormSum = 0.0f
        for (v in query) {
            queryNormSum += v * v
        }
        val queryNorm = if (queryNormSum > 0.0f) sqrt(queryNormSum) else 1.0f

        var bestUserId: String? = null
        var maxSimilarity = -1.0f

        val count = enrolledEmbeddings.size
        for (i in 0 until count) {
            val cachedVector = enrolledEmbeddings[i]
            val cachedNorm = enrolledNorms[i]

            if (cachedVector.size == size) {
                var dotProduct = 0.0f
                for (j in 0 until size) {
                    dotProduct += query[j] * cachedVector[j]
                }

                val similarity = dotProduct / (queryNorm * cachedNorm)
                if (similarity > maxSimilarity) {
                    maxSimilarity = similarity
                    bestUserId = enrolledUserIds[i]
                }
            }
        }
        return MatchResult(bestUserId, maxSimilarity)
    }

    data class MatchResult(val userId: String?, val similarity: Float)
}
