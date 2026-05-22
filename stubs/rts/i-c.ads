--  Minimal Interfaces.C stub for wasm32.
package Interfaces.C is
   pragma Pure;

   type int      is new Integer;
   type unsigned is mod 2**32;
   type long     is new Long_Integer;
   type unsigned_long is mod 2**32;
   type size_t   is mod 2**32;
   type ptrdiff_t is new Long_Integer;

   type char is new Character;
   type char_array is array (size_t range <>) of aliased char;

   type C_float  is new Float;
   type double   is new Long_Float;
   type long_double is new Long_Float;

   type short is range -(2**15) .. (2**15 - 1);
   for short'Size use 16;

   type unsigned_short is mod 2**16;
   for unsigned_short'Size use 16;

   type unsigned_char is mod 2**8;
   for unsigned_char'Size use 8;

   type signed_char is range -128 .. 127;
   for signed_char'Size use 8;

end Interfaces.C;
