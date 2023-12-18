import {
  AZURE_DEPLOYMENT_ID,
  AZURE_MODELS_PATH,
  OPENAI_API_HOST,
  OPENAI_API_TYPE,
  OPENAI_API_VERSION,
  OPENAI_ORGANIZATION,
} from '@/utils/app/const';

import { OpenAIModel, OpenAIModelID, OpenAIModels } from '@/types/openai';

import { procedure, router } from '../trpc';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

export const models = router({
  list: procedure
    .input(
      z.object({
        key: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const key = input.key;

      let url = `${OPENAI_API_HOST}/v1/models`;
      if (OPENAI_API_TYPE === 'azure') {
        url = `${OPENAI_API_HOST}/openai/${AZURE_MODELS_PATH}?api-version=${OPENAI_API_VERSION}`;
      }

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...(OPENAI_API_TYPE === 'openai' && {
            Authorization: `Bearer ${key ? key : process.env.OPENAI_API_KEY}`,
          }),
          ...(OPENAI_API_TYPE === 'azure' && {
            'api-key': `${key ? key : process.env.OPENAI_API_KEY}`,
          }),
          ...(OPENAI_API_TYPE === 'openai' &&
            OPENAI_ORGANIZATION && {
              'OpenAI-Organization': OPENAI_ORGANIZATION,
            }),
        },
      });

      if (response.status === 401) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });
      } else if (response.status !== 200) {
        console.error(
          `OpenAI API returned an error ${
            response.status
          }: ${await response.text()}`,
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'OpenAI API returned an error',
        });
      }

      const json = await response.json();

      let models: OpenAIModel[] = json.data
        .map((model: any) => {
          const model_name =
            OPENAI_API_TYPE === 'azure' ? model.model || model.id : model.id;
          for (const [key, value] of Object.entries(OpenAIModelID)) {
            if (value === model_name) {
              const r: OpenAIModel = {
                id: model.id,
                azureDeploymentId:
                  OPENAI_API_TYPE === 'azure' ? model.id : undefined,
                name: OpenAIModels[value].name,
                maxLength: OpenAIModels[value].maxLength,
                tokenLimit: OpenAIModels[value].tokenLimit,
                type: OpenAIModels[value].type,
              };

              return r;
            }
          }
        })
        .filter(Boolean);

      if (OPENAI_API_TYPE === 'azure' && AZURE_DEPLOYMENT_ID) {
        // Attempt to only show 1 specific model for the user to select when using Azure. If AZURE_DEPLOYMENT_ID has no value then show all models.
        const filteredModels = models.filter(
          (model) => model.id === AZURE_DEPLOYMENT_ID,
        );
        if (filteredModels.length > 0) {
          // Only provide 1 model

          models = filteredModels;
        }
      }
      return models;
    }),
});
