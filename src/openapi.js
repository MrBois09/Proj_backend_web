import { GAME_GENRES } from './constants/gameGenres.js';

const successResponse = {
  description: 'Request completed successfully',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/SuccessResponse' }
    }
  }
};

const errorResponse = {
  description: 'Request failed',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' }
    }
  }
};

const jsonBody = (schema, required = true) => ({
  required,
  content: {
    'application/json': {
      schema: { $ref: `#/components/schemas/${schema}` }
    }
  }
});

const idParameter = (name = 'id', description = 'MongoDB ObjectId') => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' }
});

const pageParameters = (maxLimit = 50, defaultLimit = 12) => [
  {
    name: 'page',
    in: 'query',
    schema: { type: 'integer', minimum: 1, default: 1 }
  },
  {
    name: 'limit',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: maxLimit, default: defaultLimit }
  }
];

const protectedOperation = (operation) => ({
  ...operation,
  security: [{ cookieAuth: [], csrfToken: [] }]
});

const refreshOperation = (operation) => ({
  ...operation,
  security: [{ refreshCookieAuth: [], csrfToken: [] }]
});

const csrfOperation = (operation) => ({
  ...operation,
  security: [{ csrfToken: [] }]
});

const paginatedListResponses = {
  200: {
    description: 'Paginated results',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/PaginatedResponse' }
      }
    }
  },
  400: errorResponse
};

const idResponses = {
  400: errorResponse,
  404: errorResponse
};

const reviewQueryParameters = [
  { name: 'search', in: 'query', schema: { type: 'string', maxLength: 100 } },
  { name: 'gameId', in: 'query', schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } },
  { name: 'genre', in: 'query', schema: { type: 'string', enum: GAME_GENRES } },
  { name: 'platform', in: 'query', schema: { type: 'string', maxLength: 60 } },
  { name: 'tag', in: 'query', schema: { type: 'string', maxLength: 40 } },
  { name: 'minRating', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 10 } },
  { name: 'maxRating', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 10 } },
  {
    name: 'sort',
    in: 'query',
    schema: {
      type: 'string',
      enum: ['mostHelpful', 'mostRecent', 'newest', 'oldest', 'highestRating', 'lowestRating'],
      default: 'mostRecent'
    }
  },
  ...pageParameters(50, 12)
];

const savedGameQueryParameters = [
  { name: 'search', in: 'query', schema: { type: 'string', maxLength: 100 } },
  {
    name: 'sort',
    in: 'query',
    schema: { type: 'string', enum: ['newest', 'title', 'highestRated', 'releaseDate'], default: 'newest' }
  },
  ...pageParameters(50, 24)
];

const uploadOperation = (summary, fieldName, multiple = false) => ({
  summary,
  tags: ['Uploads'],
  ...(!multiple ? {
    requestBody: {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: [fieldName],
            properties: { [fieldName]: { type: 'string', format: 'binary' } }
          }
        }
      }
    }
  } : {
    requestBody: {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: [fieldName],
            properties: { [fieldName]: { type: 'array', maxItems: 8, items: { type: 'string', format: 'binary' } } }
          }
        }
      }
    }
  }),
  responses: {
    201: successResponse,
    400: errorResponse,
    401: errorResponse,
    413: errorResponse,
    422: errorResponse,
    503: errorResponse
  },
});

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Gamer Review API',
    version: '1.0.0',
    description: [
      'HTTP API for Gamer Review. All API paths below are prefixed with `/api`.',
      '',
      'Authentication uses HttpOnly access and refresh cookies. Call `GET /auth/csrf` first and send the returned token as `X-CSRF-Token` on unsafe requests, except registration, login, forgot-password, and reset-password.',
      '',
      'Registration does not require email verification. Game genres are fixed to Action, RPG, Adventure, FPS, Strategy, Horror, and Indie. Image uploads use multipart form data; accepted formats are JPG, PNG, and WebP up to 5 MB per file.'
    ].join('\n')
  },
  servers: [{ url: '/api', description: 'This deployment' }],
  tags: [
    { name: 'Health' },
    { name: 'Authentication' },
    { name: 'Games' },
    { name: 'Reviews' },
    { name: 'Users' },
    { name: 'Uploads' }
  ],
  paths: {
    '/health': {
      get: {
        summary: 'Check API and database health',
        tags: ['Health'],
        responses: {
          200: successResponse,
          503: errorResponse
        }
      }
    },
    '/auth/csrf': {
      get: {
        summary: 'Get a CSRF token and set the CSRF cookie',
        tags: ['Authentication'],
        responses: { 200: successResponse }
      }
    },
    '/auth/register': {
      post: {
        summary: 'Register an account',
        tags: ['Authentication'],
        requestBody: jsonBody('RegisterInput'),
        responses: { 201: successResponse, 409: errorResponse, 422: errorResponse }
      }
    },
    '/auth/login': {
      post: {
        summary: 'Sign in and set authentication cookies',
        tags: ['Authentication'],
        requestBody: jsonBody('LoginInput'),
        responses: { 200: successResponse, 401: errorResponse, 422: errorResponse, 429: errorResponse }
      }
    },
    '/auth/me': {
      get: {
        summary: 'Get the current account',
        tags: ['Authentication'],
        security: [{ cookieAuth: [] }],
        responses: { 200: successResponse, 401: errorResponse }
      }
    },
    '/auth/refresh': {
      post: refreshOperation({
        summary: 'Rotate the refresh session and renew authentication cookies',
        tags: ['Authentication'],
        responses: { 200: successResponse, 401: errorResponse, 403: errorResponse, 429: errorResponse }
      })
    },
    '/games/genres': {
      get: {
        summary: 'List the supported game genres',
        tags: ['Games'],
        responses: { 200: successResponse }
      }
    },
    '/auth/logout': {
      post: csrfOperation({
        summary: 'Sign out and clear authentication cookies',
        tags: ['Authentication'],
        responses: { 200: successResponse, 403: errorResponse }
      })
    },
    '/auth/forgot-password': {
      post: {
        summary: 'Request a password reset email',
        tags: ['Authentication'],
        requestBody: jsonBody('EmailInput'),
        responses: { 200: successResponse, 422: errorResponse, 429: errorResponse }
      }
    },
    '/auth/reset-password': {
      post: {
        summary: 'Reset a password with its one-time token',
        tags: ['Authentication'],
        requestBody: jsonBody('ResetPasswordInput'),
        responses: { 200: successResponse, 400: errorResponse, 422: errorResponse, 429: errorResponse }
      }
    },
    '/auth/change-password': {
      patch: protectedOperation({
        summary: 'Change the current account password',
        tags: ['Authentication'],
        requestBody: jsonBody('ChangePasswordInput'),
        responses: { 200: successResponse, 401: errorResponse, 422: errorResponse, 429: errorResponse }
      })
    },
    '/games': {
      get: {
        summary: 'Search and list approved games',
        tags: ['Games'],
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string', maxLength: 100 } },
          { name: 'genre', in: 'query', schema: { type: 'string', enum: GAME_GENRES } },
          { name: 'platform', in: 'query', schema: { type: 'string', maxLength: 60 } },
          { name: 'minRating', in: 'query', schema: { type: 'number', minimum: 0, maximum: 10 } },
          { name: 'releaseYear', in: 'query', schema: { type: 'integer', minimum: 1950, maximum: 2100 } },
          { name: 'communityAdded', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
          {
            name: 'sort',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['popular', 'highestRated', 'mostReviewed', 'newestReleases', 'recentlyAdded', 'alphabetical'],
              default: 'popular'
            }
          },
          ...pageParameters()
        ],
        responses: paginatedListResponses
      },
      post: protectedOperation({
        summary: 'Submit a game for review and approval',
        tags: ['Games'],
        requestBody: jsonBody('GameCreateInput'),
        responses: { 201: successResponse, 401: errorResponse, 409: errorResponse, 422: errorResponse }
      })
    },
    '/games/featured': {
      get: {
        summary: 'List featured games',
        tags: ['Games'],
        parameters: pageParameters(),
        responses: paginatedListResponses
      }
    },
    '/games/trending': {
      get: {
        summary: 'List trending games',
        tags: ['Games'],
        parameters: pageParameters(),
        responses: paginatedListResponses
      }
    },
    '/games/top-rated': {
      get: {
        summary: 'List top-rated games',
        tags: ['Games'],
        parameters: pageParameters(),
        responses: paginatedListResponses
      }
    },
    '/games/new-releases': {
      get: {
        summary: 'List recently released games',
        tags: ['Games'],
        parameters: pageParameters(),
        responses: paginatedListResponses
      }
    },
    '/games/pending': {
      get: protectedOperation({
        summary: 'List pending game submissions (administrator only)',
        tags: ['Games'],
        parameters: pageParameters(50, 20),
        responses: { ...paginatedListResponses, 401: errorResponse, 403: errorResponse }
      })
    },
    '/games/{idOrSlug}': {
      get: {
        summary: 'Get an approved game by ObjectId or slug',
        tags: ['Games'],
        parameters: [{
          name: 'idOrSlug',
          in: 'path',
          required: true,
          schema: { type: 'string' }
        }],
        responses: { 200: successResponse, 404: errorResponse }
      },
      patch: protectedOperation({
        summary: 'Update a game (administrator only)',
        tags: ['Games'],
        parameters: [idParameter('idOrSlug')],
        requestBody: jsonBody('GameInput'),
        responses: { 200: successResponse, ...idResponses, 401: errorResponse, 403: errorResponse, 422: errorResponse }
      }),
      delete: protectedOperation({
        summary: 'Delete a game and its dependent records (administrator only)',
        tags: ['Games'],
        parameters: [idParameter('idOrSlug')],
        responses: { 200: successResponse, ...idResponses, 401: errorResponse, 403: errorResponse }
      })
    },
    '/games/{id}/moderate': {
      patch: protectedOperation({
        summary: 'Approve or reject a game submission (administrator only)',
        tags: ['Games'],
        parameters: [idParameter()],
        requestBody: jsonBody('ModerateGameInput'),
        responses: { 200: successResponse, ...idResponses, 401: errorResponse, 403: errorResponse, 422: errorResponse }
      })
    },
    '/games/{gameId}/reviews': {
      get: {
        summary: 'List reviews for a game',
        tags: ['Reviews'],
        parameters: [idParameter('gameId'), ...reviewQueryParameters],
        responses: paginatedListResponses
      },
      post: protectedOperation({
        summary: 'Create a review for an approved game',
        tags: ['Reviews'],
        parameters: [idParameter('gameId')],
        requestBody: jsonBody('ReviewCreateInput'),
        responses: { 201: successResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }
      })
    },
    '/reviews': {
      get: {
        summary: 'Search and list reviews',
        tags: ['Reviews'],
        parameters: reviewQueryParameters,
        responses: paginatedListResponses
      }
    },
    '/reviews/recent': {
      get: {
        summary: 'List recent reviews',
        tags: ['Reviews'],
        parameters: reviewQueryParameters,
        responses: paginatedListResponses
      }
    },
    '/reviews/{id}': {
      get: {
        summary: 'Get a review',
        tags: ['Reviews'],
        parameters: [idParameter()],
        responses: { 200: successResponse, ...idResponses }
      },
      patch: protectedOperation({
        summary: 'Update a review (author only)',
        tags: ['Reviews'],
        parameters: [idParameter()],
        requestBody: jsonBody('ReviewInput'),
        responses: { 200: successResponse, ...idResponses, 401: errorResponse, 403: errorResponse, 422: errorResponse }
      }),
      delete: protectedOperation({
        summary: 'Delete a review (author only)',
        tags: ['Reviews'],
        parameters: [idParameter()],
        responses: { 200: successResponse, ...idResponses, 401: errorResponse, 403: errorResponse }
      })
    },
    '/reviews/{id}/like': {
      post: protectedOperation({
        summary: 'Like a review',
        tags: ['Reviews'],
        parameters: [idParameter()],
        responses: { 200: successResponse, ...idResponses, 401: errorResponse, 403: errorResponse }
      }),
      delete: protectedOperation({
        summary: 'Remove a like from a review',
        tags: ['Reviews'],
        parameters: [idParameter()],
        responses: { 200: successResponse, ...idResponses, 401: errorResponse, 403: errorResponse }
      })
    },
    '/reviews/{id}/vote': {
      post: protectedOperation({
        summary: 'Set or toggle a review vote',
        tags: ['Reviews'],
        parameters: [idParameter()],
        requestBody: jsonBody('ReviewVoteInput'),
        responses: { 200: successResponse, ...idResponses, 401: errorResponse, 403: errorResponse, 422: errorResponse }
      })
    },
    '/users/{username}': {
      get: {
        summary: 'Get a public user profile',
        tags: ['Users'],
        parameters: [{ name: 'username', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: successResponse, 404: errorResponse }
      }
    },
    '/users/{username}/reviews': {
      get: {
        summary: 'List reviews written by a user',
        tags: ['Users', 'Reviews'],
        parameters: [
          { name: 'username', in: 'path', required: true, schema: { type: 'string' } },
          ...reviewQueryParameters
        ],
        responses: paginatedListResponses
      }
    },
    '/users/{username}/favorites': {
      get: {
        summary: 'List a user’s public favorite games',
        tags: ['Users'],
        parameters: [
          { name: 'username', in: 'path', required: true, schema: { type: 'string' } },
          ...savedGameQueryParameters
        ],
        responses: paginatedListResponses
      }
    },
    '/users/me': {
      patch: protectedOperation({
        summary: 'Update the current user profile',
        tags: ['Users'],
        requestBody: jsonBody('ProfileInput'),
        responses: { 200: successResponse, 401: errorResponse, 409: errorResponse, 422: errorResponse }
      })
    },
    '/users/me/wishlist': {
      get: protectedOperation({
        summary: 'List the current user’s private wishlist',
        tags: ['Users'],
        parameters: savedGameQueryParameters,
        responses: { ...paginatedListResponses, 401: errorResponse }
      })
    },
    '/users/me/wishlist/{gameId}': {
      post: protectedOperation({
        summary: 'Add a game to the current user’s wishlist',
        tags: ['Users'],
        parameters: [idParameter('gameId')],
        responses: { 200: successResponse, 400: errorResponse, 401: errorResponse, 404: errorResponse }
      }),
      delete: protectedOperation({
        summary: 'Remove a game from the current user’s wishlist',
        tags: ['Users'],
        parameters: [idParameter('gameId')],
        responses: { 200: successResponse, 400: errorResponse, 401: errorResponse }
      })
    },
    '/users/me/favorites': {
      get: protectedOperation({
        summary: 'List the current user’s favorite games',
        tags: ['Users'],
        parameters: savedGameQueryParameters,
        responses: { ...paginatedListResponses, 401: errorResponse }
      })
    },
    '/users/me/favorites/{gameId}': {
      post: protectedOperation({
        summary: 'Add a game to the current user’s favorites',
        tags: ['Users'],
        parameters: [idParameter('gameId')],
        responses: { 200: successResponse, 400: errorResponse, 401: errorResponse, 404: errorResponse }
      }),
      delete: protectedOperation({
        summary: 'Remove a game from the current user’s favorites',
        tags: ['Users'],
        parameters: [idParameter('gameId')],
        responses: { 200: successResponse, 400: errorResponse, 401: errorResponse }
      })
    },
    '/uploads/avatar': { post: protectedOperation(uploadOperation('Upload an avatar image', 'image')) },
    '/uploads/avatar/profile': { post: protectedOperation(uploadOperation('Upload and set the current user avatar', 'image')) },
    '/uploads/game-cover': { post: protectedOperation(uploadOperation('Upload a game cover image', 'image')) },
    '/uploads/game-banner': { post: protectedOperation(uploadOperation('Upload a game banner image', 'image')) },
    '/uploads/screenshots': { post: protectedOperation(uploadOperation('Upload up to 8 screenshots', 'images', true)) },
    '/uploads/review-images': { post: protectedOperation(uploadOperation('Upload up to 8 review images', 'images', true)) }
  },
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'gr_access',
        description: 'HttpOnly access cookie is set by the login endpoint. Use the browser cookie jar; do not expose tokens in frontend storage.'
      },
      refreshCookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'gr_refresh',
        description: 'HttpOnly refresh cookie set during login. It is rotated by the refresh endpoint.'
      },
      csrfToken: {
        type: 'apiKey',
        in: 'header',
        name: 'X-CSRF-Token',
        description: 'Use the token from GET /auth/csrf. The matching gr_csrf cookie must also be present.'
      }
    },
    schemas: {
      SuccessResponse: {
        type: 'object',
        required: ['success', 'message'],
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: {},
          pagination: { $ref: '#/components/schemas/Pagination' }
        }
      },
      PaginatedResponse: {
        type: 'object',
        required: ['success', 'message', 'data', 'pagination'],
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: { type: 'array', items: { type: 'object', additionalProperties: true } },
          pagination: { $ref: '#/components/schemas/Pagination' }
        }
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 12 },
          total: { type: 'integer', example: 0 },
          totalPages: { type: 'integer', example: 0 }
        }
      },
      ErrorResponse: {
        type: 'object',
        required: ['success', 'message'],
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          code: { type: 'string' },
          errors: { type: 'array', items: { type: 'object', additionalProperties: true } }
        }
      },
      RegisterInput: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          displayName: { type: 'string', minLength: 1, maxLength: 80, description: 'Provide this or name.' },
          name: { type: 'string', minLength: 1, maxLength: 80, description: 'Frontend form alias for displayName.' },
          username: { type: 'string', minLength: 3, maxLength: 30, pattern: '^[a-zA-Z0-9_]+$', description: 'Optional; generated from the email address when omitted.' },
          email: { type: 'string', format: 'email', maxLength: 254 },
          password: { type: 'string', minLength: 8, maxLength: 128 },
          confirmPassword: { type: 'string' }
        }
      },
      LoginInput: {
        type: 'object',
        required: ['password'],
        properties: {
          identifier: { type: 'string', description: 'Email or username.' },
          email: { type: 'string', format: 'email' },
          username: { type: 'string' },
          password: { type: 'string', minLength: 1 }
        },
        description: 'Provide identifier, or email/username, together with password.'
      },
      EmailInput: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string', format: 'email' } }
      },
      Password: {
        type: 'string',
        minLength: 8,
        maxLength: 128
      },
      ResetPasswordInput: {
        type: 'object',
        required: ['token', 'newPassword'],
        properties: {
          token: { type: 'string', minLength: 32, maxLength: 256 },
          newPassword: { $ref: '#/components/schemas/Password' },
          confirmPassword: { type: 'string' }
        }
      },
      ChangePasswordInput: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { $ref: '#/components/schemas/Password' },
          confirmPassword: { type: 'string' }
        }
      },
      ImageReference: {
        type: 'object',
        required: ['url', 'publicId'],
        properties: {
          url: { type: 'string', format: 'uri', pattern: '^https://res\\.cloudinary\\.com/' },
          publicId: { type: 'string', minLength: 1, maxLength: 255 }
        }
      },
      GameInput: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 120 },
          coverImageUrl: { type: 'string', format: 'uri', description: 'Required together with coverPublicId when submitting a new game.' },
          coverPublicId: { type: 'string', maxLength: 255, description: 'Required together with coverImageUrl when submitting a new game.' },
          bannerImageUrl: { type: 'string', format: 'uri' },
          bannerPublicId: { type: 'string', maxLength: 255 },
          screenshots: { type: 'array', maxItems: 12, items: { $ref: '#/components/schemas/ImageReference' } },
          description: { type: 'string', minLength: 1, maxLength: 10000 },
          genres: { type: 'array', maxItems: GAME_GENRES.length, items: { type: 'string', enum: GAME_GENRES } },
          platforms: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 60 } },
          releaseDate: { type: 'string', format: 'date-time' },
          releaseYear: { type: 'integer', minimum: 1950, maximum: 2100 },
          developer: { type: 'string', maxLength: 120 },
          publisher: { type: 'string', maxLength: 120 },
          officialWebsite: { type: 'string', format: 'uri', maxLength: 2048 }
        }
      },
      GameCreateInput: {
        allOf: [
          { $ref: '#/components/schemas/GameInput' },
          {
            type: 'object',
            required: ['title', 'description', 'coverImageUrl', 'coverPublicId'],
            properties: {
              coverImageUrl: { type: 'string', format: 'uri', pattern: '^https://res\\.cloudinary\\.com/' },
              coverPublicId: { type: 'string', minLength: 1, maxLength: 255 }
            }
          }
        ]
      },
      ModerateGameInput: {
        type: 'object',
        required: ['approvalStatus'],
        properties: { approvalStatus: { type: 'string', enum: ['approved', 'rejected'] } }
      },
      ReviewInput: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 160 },
          content: { type: 'string', minLength: 1, maxLength: 10000 },
          rating: { type: 'integer', minimum: 1, maximum: 10 },
          pros: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 300 } },
          cons: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 300 } },
          tags: { type: 'array', maxItems: 30, items: { type: 'string', minLength: 1, maxLength: 40 } },
          images: { type: 'array', maxItems: 8, items: { $ref: '#/components/schemas/ImageReference' } },
          containsSpoilers: { type: 'boolean' }
        },
        description: 'Creating a review requires title, content, and rating. Update requests accept one or more fields.'
      },
      ReviewCreateInput: {
        allOf: [
          { $ref: '#/components/schemas/ReviewInput' },
          { type: 'object', required: ['title', 'content', 'rating'] }
        ]
      },
      ReviewVoteInput: {
        type: 'object',
        required: ['type'],
        properties: { type: { type: 'string', enum: ['like', 'helpful', 'notHelpful'] } }
      },
      ProfileInput: {
        type: 'object',
        minProperties: 1,
        properties: {
          displayName: { type: 'string', minLength: 1, maxLength: 80 },
          username: { type: 'string', minLength: 3, maxLength: 30, pattern: '^[a-zA-Z0-9_]+$' },
          bio: { type: 'string', maxLength: 500 },
          favoriteTags: { type: 'array', maxItems: 30, items: { type: 'string', minLength: 1, maxLength: 40 } }
        }
      }
    }
  }
};
