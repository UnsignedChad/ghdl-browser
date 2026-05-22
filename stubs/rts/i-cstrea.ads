--  Minimal Interfaces.C_Streams stub for wasm32.
with System;
with Interfaces.C;

package Interfaces.C_Streams is
   pragma Preelaborate;

   subtype int    is Interfaces.C.int;
   subtype size_t is Interfaces.C.size_t;

   --  Opaque FILE pointer
   type FILEs is new System.Address;
   NULL_Stream : constant FILEs;

   stdin  : constant FILEs;
   stdout : constant FILEs;
   stderr : constant FILEs;

   --  File operations
   function fopen  (filename : System.Address;
                    mode     : System.Address) return FILEs;
   function fclose (stream : FILEs) return int;
   function feof   (stream : FILEs) return int;
   function ferror (stream : FILEs) return int;
   procedure clearerr (stream : FILEs);
   function fflush (stream : FILEs) return int;
   function fwrite (buffer : System.Address;
                    size   : size_t;
                    count  : size_t;
                    stream : FILEs) return size_t;
   function fread  (buffer : System.Address;
                    size   : size_t;
                    count  : size_t;
                    stream : FILEs) return size_t;

private
   NULL_Stream : constant FILEs := FILEs (System.Null_Address);
   pragma Import (C, stdin,  "__ghdl_get_stdin");
   pragma Import (C, stdout, "__ghdl_get_stdout");
   pragma Import (C, stderr, "__ghdl_get_stderr");
   pragma Import (C, fopen);
   pragma Import (C, fclose);
   pragma Import (C, feof);
   pragma Import (C, ferror);
   pragma Import (C, clearerr);
   pragma Import (C, fflush);
   pragma Import (C, fwrite);
   pragma Import (C, fread);
end Interfaces.C_Streams;
