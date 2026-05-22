--  Minimal Interfaces.C stub for wasm32.
package Interfaces.C is
   pragma Pure;

   type int      is new Integer;
   type unsigned is mod 2**32;
   type long     is new Long_Integer;
   type size_t   is mod 2**32;

   type char is new Character;
   type char_array is array (size_t range <>) of aliased char;

end Interfaces.C;
