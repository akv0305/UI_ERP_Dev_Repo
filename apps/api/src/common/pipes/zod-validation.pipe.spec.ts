import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().nonnegative(),
  });

  const pipe = new ZodValidationPipe(schema);

  it('returns the parsed value for valid input', () => {
    const value = { name: 'Ada', age: 36 };

    expect(pipe.transform(value, { type: 'body' })).toEqual(value);
  });

  it('strips unknown properties', () => {
    const result = pipe.transform({ name: 'Ada', age: 36, extra: true }, { type: 'body' });

    expect(result).toEqual({ name: 'Ada', age: 36 });
  });

  it('throws BadRequestException for invalid input', () => {
    expect(() => pipe.transform({ name: '', age: -1 }, { type: 'body' })).toThrow(
      BadRequestException,
    );
  });

  it('includes validation details in the exception response', () => {
    try {
      pipe.transform({ name: 42 }, { type: 'body' });
      throw new Error('expected the pipe to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse();
      expect(response).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
  });
});
