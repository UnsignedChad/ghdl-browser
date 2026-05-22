--  Minimal Ada.Calendar.Time_Zones stub for wasm32.
package Ada.Calendar.Time_Zones is
   pragma Preelaborate;

   type Time_Offset is range -28 * 60 .. 28 * 60;
   Unknown_Zone_Error : exception;

   function UTC_Time_Offset (Date : Time := Clock) return Time_Offset;
end Ada.Calendar.Time_Zones;
